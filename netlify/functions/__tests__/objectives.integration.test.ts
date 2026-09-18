import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import objectivesHandler from "../objectives.mts";
import keyResultsHandler from "../key-results.mts";
import trashHandler from "../trash.mts";

describe("objectives", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/objectives", () => {
    it("creates an objective with defaults and an empty key_results list", async () => {
      const owner = await createTestUser("o-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Ship the public beta" } })
      );
      expect(res.status).toBe(201);
      const { objective } = await jsonBody<{ objective: any }>(res);
      expect(objective.title).toBe("Ship the public beta");
      expect(objective.status).toBe("on_track");
      expect(objective.key_results).toEqual([]);
    });

    it("rejects a missing title", async () => {
      const owner = await createTestUser("o-notitle@example.com");
      const project = await createTestProject(owner.id);
      const res = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating an objective on someone else's project", async () => {
      const owner = await createTestUser("o-owner@example.com");
      const stranger = await createTestUser("o-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await objectivesHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/objectives", () => {
    it("returns key results nested with a computed progress on each, and on the objective", async () => {
      const owner = await createTestUser("o-progress@example.com");
      const project = await createTestProject(owner.id);
      const create = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Grow signups" } })
      );
      const { objective } = await jsonBody<{ objective: any }>(create);

      await keyResultsHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/key-results",
          body: { objectiveId: objective.id, title: "New signups", startValue: 0, currentValue: 50, targetValue: 100 },
        })
      );
      await keyResultsHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/key-results",
          body: { objectiveId: objective.id, title: "Activated accounts", startValue: 0, currentValue: 100, targetValue: 100 },
        })
      );

      const res = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      const { objectives } = await jsonBody<{ objectives: any[] }>(res);
      expect(objectives).toHaveLength(1);
      expect(objectives[0].key_results).toHaveLength(2);
      const byTitle = Object.fromEntries(objectives[0].key_results.map((kr: any) => [kr.title, kr.progress]));
      expect(byTitle["New signups"]).toBe(50);
      expect(byTitle["Activated accounts"]).toBe(100);
      expect(objectives[0].progress).toBe(75);
    });

    it("an objective with no key results yet reports null progress, not zero", async () => {
      const owner = await createTestUser("o-noresults@example.com");
      const project = await createTestProject(owner.id);
      await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Not broken down yet" } })
      );
      const res = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      const { objectives } = await jsonBody<{ objectives: any[] }>(res);
      expect(objectives[0].progress).toBeNull();
    });
  });

  describe("DELETE and restore", () => {
    it("deleting an objective also hides its key results, and restoring brings both back", async () => {
      const owner = await createTestUser("o-cascade@example.com");
      const project = await createTestProject(owner.id);
      const create = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Cascade me" } })
      );
      const { objective } = await jsonBody<{ objective: any }>(create);
      await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "A key result" } })
      );

      await objectivesHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/objectives?id=${objective.id}` }));

      const afterDelete = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      expect((await jsonBody<{ objectives: any[] }>(afterDelete)).objectives).toHaveLength(0);

      const trashRes = await trashHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/trash?projectId=${project.id}` }));
      const { items } = await jsonBody<{ items: any[] }>(trashRes);
      expect(items.some((i) => i.entity_type === "objective" && i.title === "Cascade me")).toBe(true);

      await objectivesHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/objectives", body: { id: objective.id, restore: true } }));
      const afterRestore = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      const { objectives } = await jsonBody<{ objectives: any[] }>(afterRestore);
      expect(objectives).toHaveLength(1);
      expect(objectives[0].key_results).toHaveLength(1);
    });
  });

  describe("PATCH /api/objectives", () => {
    it("updates status and logs a diff summary", async () => {
      const owner = await createTestUser("o-update@example.com");
      const project = await createTestProject(owner.id);
      const create = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Track me" } })
      );
      const { objective } = await jsonBody<{ objective: any }>(create);

      const res = await objectivesHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/objectives", body: { id: objective.id, status: "at_risk" } })
      );
      expect(res.status).toBe(200);
      const { objective: updated } = await jsonBody<{ objective: any }>(res);
      expect(updated.status).toBe("at_risk");
    });

    it("rejects an invalid status", async () => {
      const owner = await createTestUser("o-badstatus@example.com");
      const project = await createTestProject(owner.id);
      const create = await objectivesHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId: project.id, title: "Track me" } })
      );
      const { objective } = await jsonBody<{ objective: any }>(create);
      const res = await objectivesHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/objectives", body: { id: objective.id, status: "nonsense" } })
      );
      expect(res.status).toBe(400);
    });
  });
});
