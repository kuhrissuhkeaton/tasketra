import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, createTestDocument, asUser, jsonBody, rawQuery } from "./fixtures.ts";
import handler from "../admin-accounts.mts";
import { db } from "../../lib/db.ts";
import { deleteAccount, HANDLED_NO_ACTION_LINKS } from "../../lib/accountRemoval.ts";

const URL = "https://app.tasketra.com/api/admin-accounts";
const ADMIN = "admin@example.com";

async function setup() {
  process.env.ADMIN_EMAIL = ADMIN;
  const admin = await createTestUser(ADMIN, { foundingMember: true });
  return { admin };
}

const post = (user: { cookie: string }, body: unknown) => handler(asUser(user, { method: "POST", url: URL, body }));
const get = (user: { cookie: string }, query = "") => handler(asUser(user, { method: "GET", url: URL + query }));

describe("admin-accounts", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    delete process.env.ADMIN_EMAIL;
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.FOUNDING_CAP;
  });

  describe("who may use it", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await handler(new Request(URL))).status).toBe(401);
    });

    it("fails closed when ADMIN_EMAIL is not set: nobody gets in", async () => {
      const someone = await createTestUser("someone@example.com", { foundingMember: true });
      expect((await get(someone)).status).toBe(403);
      expect((await post(someone, { userId: someone.id, action: "delete", confirmEmail: someone.email })).status).toBe(403);
    });

    it("rejects a signed-in user who is not the admin", async () => {
      await setup();
      const other = await createTestUser("other@example.com");
      expect((await get(other)).status).toBe(403);
      expect((await post(other, { userId: other.id, action: "remove-founding" })).status).toBe(403);
    });

    it("rejects other methods", async () => {
      const { admin } = await setup();
      expect((await handler(asUser(admin, { method: "DELETE", url: URL }))).status).toBe(405);
    });
  });

  describe("listing", () => {
    it("lists founding members by default and everyone with scope=all", async () => {
      const { admin } = await setup();
      await createTestUser("founder@example.com", { foundingMember: true });
      await createTestUser("regular@example.com");
      const founding = await jsonBody<{ accounts: { email: string }[]; summary: any }>(await get(admin));
      expect(founding.accounts.map((a) => a.email)).toEqual([ADMIN, "founder@example.com"]);
      const all = await jsonBody<{ accounts: { email: string }[]; summary: any }>(await get(admin, "?scope=all"));
      expect(all.accounts.length).toBe(3);
      expect(all.summary).toMatchObject({ foundingClaimed: 2, cap: 100, totalAccounts: 3 });
    });

    it("marks your own row, project counts, and plan", async () => {
      const { admin } = await setup();
      const owner = await createTestUser("owner@example.com", { foundingMember: true });
      await createTestProject(owner.id, "A");
      await createTestProject(owner.id, "B");
      const body = await jsonBody<{ accounts: any[] }>(await get(admin));
      expect(body.accounts.find((a) => a.email === ADMIN).is_you).toBe(true);
      expect(body.accounts.find((a) => a.email === "owner@example.com")).toMatchObject({ is_you: false, project_count: 2 });
    });

    it("flags accounts that share a mailbox, even when one is not a founding member", async () => {
      const { admin } = await setup();
      await createTestUser("karissa@gmail.com", { foundingMember: true });
      await createTestUser("karissa+test@gmail.com", { foundingMember: false });
      await createTestUser("k.a.r.i.s.s.a@gmail.com", { foundingMember: true });
      await createTestUser("unrelated@example.com", { foundingMember: true });
      const body = await jsonBody<{ accounts: any[] }>(await get(admin, "?scope=all"));
      const by = (e: string) => body.accounts.find((a) => a.email === e);
      expect(by("karissa@gmail.com").possible_duplicates.sort()).toEqual(["k.a.r.i.s.s.a@gmail.com", "karissa+test@gmail.com"]);
      expect(by("karissa+test@gmail.com").possible_duplicates.length).toBe(2);
      expect(by("unrelated@example.com").possible_duplicates).toEqual([]);
    });

    it("reports the configured cap", async () => {
      const { admin } = await setup();
      process.env.FOUNDING_CAP = "40";
      const body = await jsonBody<{ summary: any }>(await get(admin));
      expect(body.summary.cap).toBe(40);
    });
  });

  describe("removing founding status", () => {
    it("keeps the account and its data, frees the spot, and logs it", async () => {
      const { admin } = await setup();
      const target = await createTestUser("test-account@example.com", { foundingMember: true });
      const project = await createTestProject(target.id, "Keep me");

      const res = await post(admin, { userId: target.id, action: "remove-founding" });
      expect(res.status).toBe(200);

      const database = db();
      const [u] = await database.sql`SELECT founding_member FROM users WHERE id = ${target.id}`;
      expect(u.founding_member).toBe(false);
      const projects = await database.sql`SELECT id FROM projects WHERE id = ${project.id}`;
      expect(projects.length).toBe(1);
      const [log] = await database.sql`SELECT action, target_email, admin_email FROM admin_actions`;
      expect(log).toEqual({ action: "remove_founding", target_email: "test-account@example.com", admin_email: ADMIN });
    });

    it("refuses an account that has no founding spot, the admin account, and unknown accounts", async () => {
      const { admin } = await setup();
      const regular = await createTestUser("regular@example.com");
      expect((await post(admin, { userId: regular.id, action: "remove-founding" })).status).toBe(400);
      expect((await post(admin, { userId: admin.id, action: "remove-founding" })).status).toBe(400);
      expect((await post(admin, { userId: "00000000-0000-0000-0000-000000000000", action: "remove-founding" })).status).toBe(404);
    });

    it("rejects a bad request body", async () => {
      const { admin } = await setup();
      expect((await post(admin, { action: "remove-founding" })).status).toBe(400);
      expect((await post(admin, { userId: admin.id, action: "explode" })).status).toBe(400);
    });
  });

  describe("previewing a delete", () => {
    it("counts what would go and reports no blockers for a plain account", async () => {
      const { admin } = await setup();
      const target = await createTestUser("target@example.com");
      const p = await createTestProject(target.id, "P1");
      await createTestProject(target.id, "P2");
      await createTestDocument(p.id, target.id, 100);
      const body = await jsonBody<{ preview: any }>(await get(admin, `?preview=${target.id}`));
      expect(body.preview).toMatchObject({ projects: 2, documents: 1, blockers: [] });
    });

    it("blocks your own account, a live subscription, and a project shared with others", async () => {
      const { admin } = await setup();
      const selfPreview = await jsonBody<{ preview: any }>(await get(admin, `?preview=${admin.id}`));
      expect(selfPreview.preview.blockers.map((b: any) => b.code)).toContain("self");

      const payer = await createTestUser("payer@example.com");
      await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, status) VALUES (${payer.id}, 'cus_1', 'active')`;
      const payerPreview = await jsonBody<{ preview: any }>(await get(admin, `?preview=${payer.id}`));
      expect(payerPreview.preview.blockers.map((b: any) => b.code)).toContain("subscription");

      const owner = await createTestUser("owner@example.com");
      const shared = await createTestProject(owner.id, "Team project");
      await db().sql`INSERT INTO project_members (project_id, invited_email, status) VALUES (${shared.id}, 'colleague@example.com', 'invited')`;
      const ownerPreview = await jsonBody<{ preview: any }>(await get(admin, `?preview=${owner.id}`));
      expect(ownerPreview.preview.blockers.map((b: any) => b.code)).toContain("shared_project");
    });

    it("does not block when the subscription is already canceled", async () => {
      const { admin } = await setup();
      const gone = await createTestUser("gone@example.com");
      await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, status) VALUES (${gone.id}, 'cus_2', 'canceled')`;
      const body = await jsonBody<{ preview: any }>(await get(admin, `?preview=${gone.id}`));
      expect(body.preview.blockers).toEqual([]);
    });

    it("404s for an unknown account", async () => {
      const { admin } = await setup();
      expect((await get(admin, "?preview=00000000-0000-0000-0000-000000000000")).status).toBe(404);
    });
  });

  describe("deleting an account", () => {
    it("requires the email to be typed exactly", async () => {
      const { admin } = await setup();
      const target = await createTestUser("typed@example.com");
      expect((await post(admin, { userId: target.id, action: "delete" })).status).toBe(400);
      expect((await post(admin, { userId: target.id, action: "delete", confirmEmail: "wrong@example.com" })).status).toBe(400);
      const still = await db().sql`SELECT id FROM users WHERE id = ${target.id}`;
      expect(still.length).toBe(1);
    });

    it("deletes the account, its projects and everything inside, and logs it", async () => {
      const { admin } = await setup();
      const target = await createTestUser("doomed@example.com", { foundingMember: true });
      const project = await createTestProject(target.id, "Doomed project");
      const database = db();
      await database.sql`INSERT INTO tasks (project_id, title) VALUES (${project.id}, 'a task')`;
      await database.sql`INSERT INTO roadmap_items (project_id, title, created_by) VALUES (${project.id}, 'an item', ${target.id})`;
      await database.sql`INSERT INTO subscriptions (user_id, stripe_customer_id, status) VALUES (${target.id}, 'cus_9', 'canceled')`;
      await createTestDocument(project.id, target.id, 50);

      const res = await post(admin, { userId: target.id, action: "delete", confirmEmail: "DOOMED@example.com" });
      expect(res.status).toBe(200);

      expect((await database.sql`SELECT id FROM users WHERE id = ${target.id}`).length).toBe(0);
      expect((await database.sql`SELECT id FROM projects WHERE id = ${project.id}`).length).toBe(0);
      expect((await database.sql`SELECT id FROM tasks WHERE project_id = ${project.id}`).length).toBe(0);
      expect((await database.sql`SELECT id FROM documents WHERE project_id = ${project.id}`).length).toBe(0);
      expect((await database.sql`SELECT id FROM subscriptions WHERE user_id = ${target.id}`).length).toBe(0);
      const [log] = await database.sql`SELECT action, target_email, details FROM admin_actions`;
      expect(log.action).toBe("delete_account");
      expect(log.target_email).toBe("doomed@example.com");
      expect(log.details).toMatchObject({ projects: 1, documents: 1, wasFounding: true });
    });

    it("reopens the founding spot for the next sign-up count", async () => {
      const { admin } = await setup();
      const target = await createTestUser("spot@example.com", { foundingMember: true });
      const before = await jsonBody<{ summary: any }>(await get(admin));
      expect(before.summary.foundingClaimed).toBe(2);
      await post(admin, { userId: target.id, action: "delete", confirmEmail: target.email });
      const after = await jsonBody<{ summary: any }>(await get(admin));
      expect(after.summary.foundingClaimed).toBe(1);
    });

    it("keeps files the account uploaded into someone else's project, handing them to that project's owner", async () => {
      const { admin } = await setup();
      const owner = await createTestUser("owner@example.com");
      const guest = await createTestUser("guest@example.com");
      const project = await createTestProject(owner.id, "Owner's project");
      await createTestDocument(project.id, guest.id, 10, { filename: "from-guest.pdf" });
      const res = await post(admin, { userId: guest.id, action: "delete", confirmEmail: guest.email });
      expect(res.status).toBe(200);
      const [doc] = await db().sql`SELECT uploaded_by FROM documents WHERE project_id = ${project.id}`;
      expect(doc.uploaded_by).toBe(owner.id);
    });

    it("blanks references from people they referred, and from roadmap items they created elsewhere", async () => {
      const { admin } = await setup();
      const referrer = await createTestUser("referrer@example.com");
      const friend = await createTestUser("friend@example.com");
      const database = db();
      await database.sql`UPDATE users SET referred_by = ${referrer.id} WHERE id = ${friend.id}`;
      const friendsProject = await createTestProject(friend.id, "Friend's");
      await database.sql`INSERT INTO roadmap_items (project_id, title, created_by) VALUES (${friendsProject.id}, 'x', ${referrer.id})`;

      const res = await post(admin, { userId: referrer.id, action: "delete", confirmEmail: referrer.email });
      expect(res.status).toBe(200);
      const [f] = await database.sql`SELECT referred_by FROM users WHERE id = ${friend.id}`;
      expect(f.referred_by).toBeNull();
      const [item] = await database.sql`SELECT created_by FROM roadmap_items WHERE project_id = ${friendsProject.id}`;
      expect(item.created_by).toBeNull();
    });

    it("refuses to delete your own account, a live subscriber, or an owner of a shared project, and deletes nothing", async () => {
      const { admin } = await setup();
      const database = db();

      const self = await post(admin, { userId: admin.id, action: "delete", confirmEmail: admin.email });
      expect(self.status).toBe(409);

      const payer = await createTestUser("payer@example.com");
      await database.sql`INSERT INTO subscriptions (user_id, stripe_customer_id, status) VALUES (${payer.id}, 'cus_3', 'trialing')`;
      expect((await post(admin, { userId: payer.id, action: "delete", confirmEmail: payer.email })).status).toBe(409);

      const owner = await createTestUser("teamowner@example.com");
      const project = await createTestProject(owner.id, "Shared");
      await database.sql`INSERT INTO project_members (project_id, invited_email, status) VALUES (${project.id}, 'x@example.com', 'invited')`;
      expect((await post(admin, { userId: owner.id, action: "delete", confirmEmail: owner.email })).status).toBe(409);

      const users = await database.sql`SELECT id FROM users`;
      expect(users.length).toBe(3);
      expect((await database.sql`SELECT id FROM projects`).length).toBe(1);
    });

    it("when the earliest of two old duplicates is deleted, the survivor's mailbox is protected again", async () => {
      const { admin } = await setup();
      const database = db();
      // Two accounts for one mailbox, made before the rule existed: only the earliest holds the canonical value.
      await database.sql`INSERT INTO users (email, email_canonical, password_hash, created_at) VALUES ('mine@gmail.com', 'mine@gmail.com', 'x', '2026-01-01')`;
      await database.sql`INSERT INTO users (email, password_hash, created_at) VALUES ('m.i.n.e+old@gmail.com', 'x', '2026-02-01')`;
      const [first] = await database.sql`SELECT id FROM users WHERE email = 'mine@gmail.com'`;

      const res = await post(admin, { userId: first.id, action: "delete", confirmEmail: "mine@gmail.com" });
      expect(res.status).toBe(200);
      const [survivor] = await database.sql`SELECT email_canonical FROM users WHERE email = 'm.i.n.e+old@gmail.com'`;
      expect(survivor.email_canonical).toBe("mine@gmail.com");
    });

    it("404s for an unknown account", async () => {
      const { admin } = await setup();
      expect((await post(admin, { userId: "00000000-0000-0000-0000-000000000000", action: "delete", confirmEmail: "x@example.com" })).status).toBe(404);
    });

    it("tells the storage layer to delete each uploaded file and the avatar, and carries on if one fails", async () => {
      const { admin } = await setup();
      const target = await createTestUser("files@example.com");
      const project = await createTestProject(target.id, "With files");
      await createTestDocument(project.id, target.id, 1);
      await createTestDocument(project.id, target.id, 2);
      const calls: string[] = [];
      let failNext = true;
      const result = await deleteAccount(db(), target.id, { id: admin.id, email: admin.email }, async (store, key) => {
        calls.push(`${store}:${key === target.id ? "avatar" : "doc"}`);
        if (store === "documents" && failNext) {
          failNext = false;
          throw new Error("storage hiccup");
        }
      });
      expect(result.ok).toBe(true);
      expect(calls.filter((c) => c === "documents:doc").length).toBe(2);
      expect(calls).toContain("avatars:avatar");
      if (result.ok) expect(result.details.blobsFailed).toBe(1);
    });

    it("running a delete again after a partial failure is safe", async () => {
      const { admin } = await setup();
      const target = await createTestUser("retry@example.com");
      await createTestProject(target.id, "P");
      const identity = { id: admin.id, email: admin.email };
      const first = await deleteAccount(db(), target.id, identity, async () => {});
      expect(first.ok).toBe(true);
      const second = await deleteAccount(db(), target.id, identity, async () => {});
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.status).toBe(404);
    });
  });

  describe("schema guard", () => {
    it("every link from another table to users that blocks deletion is handled by the removal code", async () => {
      const { rows } = await rawQuery(`
        SELECT con.conrelid::regclass::text AS tbl, att.attname AS col
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass AND con.confdeltype IN ('a', 'r')
      `);
      const found = rows.map((r: any) => `${r.tbl}.${r.col}`).sort();
      expect(found).toEqual([...HANDLED_NO_ACTION_LINKS].sort());
    });
  });
});
