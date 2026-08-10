import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import roadmapHandler from "../roadmap.mts";
import roadmapPublicHandler from "../roadmap-public.mts";
import projectHandler from "../project.mts";
import { db } from "../../lib/db.ts";

describe("roadmap", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/roadmap", () => {
    it("creates an item with defaults when only title is given", async () => {
      const owner = await createTestUser("rm-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await roadmapHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Kickoff" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ item: any }>(res);
      expect(body.item.title).toBe("Kickoff");
      expect(body.item.type).toBe("milestone");
      expect(body.item.status).toBe("not_started");
      expect(body.item.swimlane).toBe("General");
    });

    it("rejects a missing title", async () => {
      const owner = await createTestUser("rm-notitle@example.com");
      const project = await createTestProject(owner.id);
      const res = await roadmapHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating an item", async () => {
      const owner = await createTestUser("rm-owner-x@example.com");
      const stranger = await createTestUser("rm-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await roadmapHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });

    it("allows an active project member (not just the owner) to add items", async () => {
      const owner = await createTestUser("rm-mem-owner@example.com");
      const member = await createTestUser("rm-mem@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
        VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())
      `;
      const res = await roadmapHandler(
        asUser(member, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Member added this" } })
      );
      expect(res.status).toBe(201);
    });

    it("falls back to 'milestone' for an invalid type instead of rejecting the request", async () => {
      const owner = await createTestUser("rm-badtype@example.com");
      const project = await createTestProject(owner.id);
      const res = await roadmapHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "X", type: "not-a-real-type" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ item: any }>(res);
      expect(body.item.type).toBe("milestone");
    });
  });

  describe("GET /api/roadmap", () => {
    it("lists items ordered by swimlane then start date", async () => {
      const owner = await createTestUser("rm-list@example.com");
      const project = await createTestProject(owner.id);
      await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "B lane item", swimlane: "B", startDate: "2026-03-01" } }));
      await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "A lane later", swimlane: "A", startDate: "2026-06-01" } }));
      await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "A lane earlier", swimlane: "A", startDate: "2026-01-01" } }));

      const res = await roadmapHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/roadmap?projectId=${project.id}` }));
      const body = await jsonBody<{ items: any[] }>(res);
      expect(body.items.map((i) => i.title)).toEqual(["A lane earlier", "A lane later", "B lane item"]);
    });

    it("excludes soft-deleted items", async () => {
      const owner = await createTestUser("rm-list-deleted@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Gone soon" } }));
      const { item } = await jsonBody<{ item: any }>(created);
      await roadmapHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/roadmap?id=${item.id}` }));

      const res = await roadmapHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/roadmap?projectId=${project.id}` }));
      const body = await jsonBody<{ items: any[] }>(res);
      expect(body.items).toHaveLength(0);
    });

    it("blocks a stranger from listing items", async () => {
      const owner = await createTestUser("rm-list-owner@example.com");
      const stranger = await createTestUser("rm-list-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await roadmapHandler(asUser(stranger, { method: "GET", url: `https://tasketra.com/api/roadmap?projectId=${project.id}` }));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/roadmap", () => {
    it("updates fields and can clear an optional date back to null", async () => {
      const owner = await createTestUser("rm-patch@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Phase 1", type: "phase", startDate: "2026-01-01", endDate: "2026-03-01" } }));
      const { item } = await jsonBody<{ item: any }>(created);

      const res = await roadmapHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/roadmap", body: { id: item.id, status: "in_progress", endDate: null } }));
      expect(res.status).toBe(200);
      const body = await jsonBody<{ item: any }>(res);
      expect(body.item.status).toBe("in_progress");
      expect(body.item.end_date).toBeNull();
      expect(String(body.item.start_date)).toContain("2026-01-01"); // untouched field stays as-is (DATE column serializes as a full timestamp)
    });

    it("rejects an invalid status", async () => {
      const owner = await createTestUser("rm-badstatus@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "X" } }));
      const { item } = await jsonBody<{ item: any }>(created);
      const res = await roadmapHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/roadmap", body: { id: item.id, status: "on_fire" } }));
      expect(res.status).toBe(400);
    });

    it("restores a soft-deleted item", async () => {
      const owner = await createTestUser("rm-restore@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Restore me" } }));
      const { item } = await jsonBody<{ item: any }>(created);
      await roadmapHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/roadmap?id=${item.id}` }));
      const restoreRes = await roadmapHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/roadmap", body: { id: item.id, restore: true } }));
      expect(restoreRes.status).toBe(200);

      const listRes = await roadmapHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/roadmap?projectId=${project.id}` }));
      const body = await jsonBody<{ items: any[] }>(listRes);
      expect(body.items).toHaveLength(1);
    });

    it("blocks a stranger from editing an item", async () => {
      const owner = await createTestUser("rm-edit-owner@example.com");
      const stranger = await createTestUser("rm-edit-stranger@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Mine" } }));
      const { item } = await jsonBody<{ item: any }>(created);
      const res = await roadmapHandler(asUser(stranger, { method: "PATCH", url: "https://tasketra.com/api/roadmap", body: { id: item.id, title: "Hijacked" } }));
      expect(res.status).toBe(404);
    });
  });

  describe("roadmap sharing (project.mts)", () => {
    it("owner can turn sharing on, which mints a token", async () => {
      const owner = await createTestUser("rm-share-owner@example.com");
      const project = await createTestProject(owner.id);
      const res = await projectHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } })
      );
      expect(res.status).toBe(200);
      const body = await jsonBody<{ project: any }>(res);
      expect(body.project.roadmap_share_enabled).toBe(true);
      expect(typeof body.project.roadmap_share_token).toBe("string");
      expect(body.project.roadmap_share_token.length).toBeGreaterThan(10);
    });

    it("does not mint a second token if one already exists when re-enabling", async () => {
      const owner = await createTestUser("rm-share-stable@example.com");
      const project = await createTestProject(owner.id);
      const first = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: p1 } = await jsonBody<{ project: any }>(first);

      await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: false } }));
      const second = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: p2 } = await jsonBody<{ project: any }>(second);

      expect(p2.roadmap_share_token).toBe(p1.roadmap_share_token);
    });

    it("regenerateRoadmapToken rotates the token, invalidating the old one", async () => {
      const owner = await createTestUser("rm-regen@example.com");
      const project = await createTestProject(owner.id);
      const first = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: p1 } = await jsonBody<{ project: any }>(first);

      const regen = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, regenerateRoadmapToken: true } }));
      const { project: p2 } = await jsonBody<{ project: any }>(regen);

      expect(p2.roadmap_share_token).not.toBe(p1.roadmap_share_token);

      const oldTokenRes = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${p1.roadmap_share_token}`));
      expect(oldTokenRes.status).toBe(404);
    });

    it("blocks a non-owner member from turning sharing on", async () => {
      const owner = await createTestUser("rm-share-block-owner@example.com");
      const member = await createTestUser("rm-share-block-member@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
        VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())
      `;
      const res = await projectHandler(
        asUser(member, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/roadmap-public (unauthenticated)", () => {
    it("returns items for a valid, enabled token -- with no auth needed", async () => {
      const owner = await createTestUser("rm-public@example.com");
      const project = await createTestProject(owner.id, "Exec View Project");
      await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Public milestone", startDate: "2026-04-01" } }));
      const enable = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: shared } = await jsonBody<{ project: any }>(enable);

      const res = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${shared.roadmap_share_token}`));
      expect(res.status).toBe(200);
      const body = await jsonBody<{ project: { name: string }; items: any[] }>(res);
      expect(body.project.name).toBe("Exec View Project");
      expect(body.items).toHaveLength(1);
      expect(body.items[0].title).toBe("Public milestone");
    });

    it("404s for a garbage token", async () => {
      const res = await roadmapPublicHandler(new Request("https://tasketra.com/api/roadmap-public?token=not-a-real-token"));
      expect(res.status).toBe(404);
    });

    it("404s once sharing is turned back off, even with the correct token", async () => {
      const owner = await createTestUser("rm-public-off@example.com");
      const project = await createTestProject(owner.id);
      const enable = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: shared } = await jsonBody<{ project: any }>(enable);

      await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: false } }));

      const res = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${shared.roadmap_share_token}`));
      expect(res.status).toBe(404);
    });

    it("never exposes soft-deleted items through the public link", async () => {
      const owner = await createTestUser("rm-public-deleted@example.com");
      const project = await createTestProject(owner.id);
      const created = await roadmapHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: project.id, title: "Will be deleted" } }));
      const { item } = await jsonBody<{ item: any }>(created);
      await roadmapHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/roadmap?id=${item.id}` }));
      const enable = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } }));
      const { project: shared } = await jsonBody<{ project: any }>(enable);

      const res = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${shared.roadmap_share_token}`));
      const body = await jsonBody<{ items: any[] }>(res);
      expect(body.items).toHaveLength(0);
    });

    it("never exposes items from a different, unrelated project", async () => {
      const owner = await createTestUser("rm-public-scope@example.com");
      const otherOwner = await createTestUser("rm-public-other@example.com");
      const sharedProject = await createTestProject(owner.id);
      const otherProject = await createTestProject(otherOwner.id);
      await roadmapHandler(asUser(otherOwner, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId: otherProject.id, title: "Not yours" } }));
      const enable = await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: sharedProject.id, roadmap_share_enabled: true } }));
      const { project: shared } = await jsonBody<{ project: any }>(enable);

      const res = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${shared.roadmap_share_token}`));
      const body = await jsonBody<{ items: any[] }>(res);
      expect(body.items).toHaveLength(0);
    });
  });
});
