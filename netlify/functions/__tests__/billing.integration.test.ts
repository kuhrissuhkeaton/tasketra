import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, createTestDocument, asUser } from "./fixtures.ts";
import {
  canCreateProject,
  getUserPlan,
  FREE_PROJECT_LIMIT,
  canUploadBytes,
  storageUsedBytes,
  storageCapBytes,
  FREE_STORAGE_CAP_BYTES,
  PAID_STORAGE_CAP_BYTES,
} from "../../lib/billing.ts";
import projectsHandler from "../projects.mts";
import { db } from "../../lib/db.ts";
import { jsonBody } from "./fixtures.ts";

async function giveActiveSubscription(userId: string, status: "trialing" | "active" | "past_due" | "canceled") {
  const database = db();
  await database.sql`
    INSERT INTO subscriptions (user_id, stripe_customer_id, status)
    VALUES (${userId}, 'cus_test123', ${status})
  `;
}

describe("billing plan limits", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("getUserPlan", () => {
    it("returns 'founding' for a founding member regardless of subscription state", async () => {
      const user = await createTestUser("founding@example.com", { foundingMember: true });
      const database = db();
      expect(await getUserPlan(database, user.id)).toBe("founding");
    });

    it("returns 'free' for a user with no subscription row", async () => {
      const user = await createTestUser("nosub@example.com");
      const database = db();
      expect(await getUserPlan(database, user.id)).toBe("free");
    });

    it("returns 'trialing' / 'active' to match the subscription row", async () => {
      const database = db();
      const trialUser = await createTestUser("trial@example.com");
      await giveActiveSubscription(trialUser.id, "trialing");
      expect(await getUserPlan(database, trialUser.id)).toBe("trialing");

      const activeUser = await createTestUser("active@example.com");
      await giveActiveSubscription(activeUser.id, "active");
      expect(await getUserPlan(database, activeUser.id)).toBe("active");
    });

    it("treats past_due and canceled as free, not paid", async () => {
      const database = db();
      const pastDue = await createTestUser("pastdue@example.com");
      await giveActiveSubscription(pastDue.id, "past_due");
      expect(await getUserPlan(database, pastDue.id)).toBe("free");

      const canceled = await createTestUser("canceled@example.com");
      await giveActiveSubscription(canceled.id, "canceled");
      expect(await getUserPlan(database, canceled.id)).toBe("free");
    });
  });

  describe("canCreateProject", () => {
    it(`allows a free-tier user up to exactly ${FREE_PROJECT_LIMIT} active projects, blocks the next`, async () => {
      const user = await createTestUser("freelimit@example.com");
      const database = db();
      for (let i = 0; i < FREE_PROJECT_LIMIT; i++) {
        expect(await canCreateProject(database, user.id)).toBe(true);
        await createTestProject(user.id, `Project ${i}`);
      }
      expect(await canCreateProject(database, user.id)).toBe(false);
    });

    it("does not count soft-deleted projects against the free limit", async () => {
      const user = await createTestUser("deletedslot@example.com");
      const database = db();
      for (let i = 0; i < FREE_PROJECT_LIMIT; i++) {
        await createTestProject(user.id, `Project ${i}`);
      }
      expect(await canCreateProject(database, user.id)).toBe(false);

      // Soft-delete one -- a slot should free up.
      const [{ id: firstProjectId }] = await database.sql<{ id: string }>`
        SELECT id FROM projects WHERE owner_id = ${user.id} LIMIT 1
      `;
      await database.sql`UPDATE projects SET archived = true, deleted_at = now() WHERE id = ${firstProjectId}`;
      expect(await canCreateProject(database, user.id)).toBe(true);
    });

    it("is unlimited for a founding member", async () => {
      const user = await createTestUser("foundingunlimited@example.com", { foundingMember: true });
      const database = db();
      for (let i = 0; i < FREE_PROJECT_LIMIT + 3; i++) {
        await createTestProject(user.id, `Project ${i}`);
      }
      expect(await canCreateProject(database, user.id)).toBe(true);
    });

    it("is unlimited for an active paid subscriber", async () => {
      const user = await createTestUser("paidunlimited@example.com");
      await giveActiveSubscription(user.id, "active");
      const database = db();
      for (let i = 0; i < FREE_PROJECT_LIMIT + 3; i++) {
        await createTestProject(user.id, `Project ${i}`);
      }
      expect(await canCreateProject(database, user.id)).toBe(true);
    });

    it("counts each user's projects independently -- one user's projects don't count against another's limit", async () => {
      const userA = await createTestUser("independent-a@example.com");
      const userB = await createTestUser("independent-b@example.com");
      const database = db();
      for (let i = 0; i < FREE_PROJECT_LIMIT; i++) {
        await createTestProject(userA.id, `A Project ${i}`);
      }
      expect(await canCreateProject(database, userA.id)).toBe(false);
      expect(await canCreateProject(database, userB.id)).toBe(true);
    });
  });

  describe("POST /api/projects (handler level)", () => {
    it("returns 402 with upgradeRequired when a free user hits the cap", async () => {
      const user = await createTestUser("handler-cap@example.com");
      for (let i = 0; i < FREE_PROJECT_LIMIT; i++) {
        const res = await projectsHandler(
          asUser(user, { method: "POST", url: "https://tasketra.com/api/projects", body: { name: `Project ${i}` } })
        );
        expect(res.status).toBe(201);
      }
      const blocked = await projectsHandler(
        asUser(user, { method: "POST", url: "https://tasketra.com/api/projects", body: { name: "One too many" } })
      );
      expect(blocked.status).toBe(402);
      const body = await jsonBody<{ upgradeRequired: boolean }>(blocked);
      expect(body.upgradeRequired).toBe(true);
    });

    it("never blocks a founding member from creating projects through the real endpoint", async () => {
      const user = await createTestUser("handler-founding@example.com", { foundingMember: true });
      for (let i = 0; i < FREE_PROJECT_LIMIT + 2; i++) {
        const res = await projectsHandler(
          asUser(user, { method: "POST", url: "https://tasketra.com/api/projects", body: { name: `Project ${i}` } })
        );
        expect(res.status).toBe(201);
      }
    });
  });

  describe("document storage caps", () => {
    it("reports zero used bytes with no documents", async () => {
      const user = await createTestUser("storage-empty@example.com");
      const database = db();
      expect(await storageUsedBytes(database, user.id)).toBe(0);
    });

    it("sums document sizes across all of an owner's projects", async () => {
      const user = await createTestUser("storage-sum@example.com");
      const database = db();
      const projectA = await createTestProject(user.id, "A");
      const projectB = await createTestProject(user.id, "B");
      await createTestDocument(projectA.id, user.id, 1000);
      await createTestDocument(projectA.id, user.id, 2000);
      await createTestDocument(projectB.id, user.id, 500);
      expect(await storageUsedBytes(database, user.id)).toBe(3500);
    });

    it("excludes soft-deleted documents from the total", async () => {
      const user = await createTestUser("storage-deleted@example.com");
      const database = db();
      const project = await createTestProject(user.id);
      await createTestDocument(project.id, user.id, 1000);
      await createTestDocument(project.id, user.id, 5000, { deleted: true });
      expect(await storageUsedBytes(database, user.id)).toBe(1000);
    });

    it("excludes another owner's documents entirely", async () => {
      const userA = await createTestUser("storage-a@example.com");
      const userB = await createTestUser("storage-b@example.com");
      const database = db();
      const projectA = await createTestProject(userA.id);
      await createTestDocument(projectA.id, userA.id, 9999);
      expect(await storageUsedBytes(database, userB.id)).toBe(0);
    });

    it(`gives free-tier users a ${FREE_STORAGE_CAP_BYTES / 1024 / 1024 / 1024}GB cap and paid/founding users a ${PAID_STORAGE_CAP_BYTES / 1024 / 1024 / 1024}GB cap`, async () => {
      const database = db();
      expect(storageCapBytes("free")).toBe(FREE_STORAGE_CAP_BYTES);
      expect(storageCapBytes("founding")).toBe(PAID_STORAGE_CAP_BYTES);
      expect(storageCapBytes("trialing")).toBe(PAID_STORAGE_CAP_BYTES);
      expect(storageCapBytes("active")).toBe(PAID_STORAGE_CAP_BYTES);
      void database; // storageCapBytes takes no db arg -- kept here for describe-block symmetry
    });

    it("blocks an upload that would push a free user over their cap, allows one that fits", async () => {
      const user = await createTestUser("storage-cap-free@example.com");
      const database = db();
      const project = await createTestProject(user.id);
      await createTestDocument(project.id, user.id, FREE_STORAGE_CAP_BYTES - 1000);

      const tooBig = await canUploadBytes(database, user.id, 2000);
      expect(tooBig.ok).toBe(false);
      expect(tooBig.capBytes).toBe(FREE_STORAGE_CAP_BYTES);

      const fits = await canUploadBytes(database, user.id, 500);
      expect(fits.ok).toBe(true);
    });

    it("allows a founding member well past the free cap, up to their own 25GB cap", async () => {
      const user = await createTestUser("storage-cap-founding@example.com", { foundingMember: true });
      const database = db();
      const project = await createTestProject(user.id);
      await createTestDocument(project.id, user.id, FREE_STORAGE_CAP_BYTES + 500 * 1024 * 1024); // 500MB past the free cap

      const result = await canUploadBytes(database, user.id, 1000);
      expect(result.ok).toBe(true);
      expect(result.capBytes).toBe(PAID_STORAGE_CAP_BYTES);
      expect(result.plan).toBe("founding");
    });

    it("a project member's upload draws against the project owner's cap, not their own", async () => {
      const owner = await createTestUser("storage-owner@example.com");
      const member = await createTestUser("storage-member@example.com");
      const database = db();
      const project = await createTestProject(owner.id);
      await createTestDocument(project.id, member.id, FREE_STORAGE_CAP_BYTES - 1000);

      // Checked against the owner's account, since that's the paying party.
      const asOwner = await canUploadBytes(database, owner.id, 2000);
      expect(asOwner.ok).toBe(false);

      // The member's own (empty) storage is unaffected -- they have no
      // projects of their own, so this is a hypothetical/unused check but
      // confirms the totals aren't cross-contaminated between accounts.
      const asMember = await canUploadBytes(database, member.id, 2000);
      expect(asMember.ok).toBe(true);
    });
  });
});
