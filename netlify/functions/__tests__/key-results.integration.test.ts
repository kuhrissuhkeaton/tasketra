import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import objectivesHandler from "../objectives.mts";
import keyResultsHandler from "../key-results.mts";

async function createObjective(owner: { cookie: string }, projectId: string, title = "Grow the thing") {
  const res = await objectivesHandler(
    asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId, title } })
  );
  const { objective } = await jsonBody<{ objective: any }>(res);
  return objective;
}

describe("key-results", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/key-results", () => {
    it("creates a percent key result with defaults when only a title is given", async () => {
      const owner = await createTestUser("kr-defaults@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);

      const res = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "New signups" } })
      );
      expect(res.status).toBe(201);
      const { keyResult } = await jsonBody<{ keyResult: any }>(res);
      expect(keyResult.metric_type).toBe("percent");
      expect(Number(keyResult.start_value)).toBe(0);
      expect(Number(keyResult.target_value)).toBe(100);
      expect(Number(keyResult.current_value)).toBe(0);
    });

    it("normalizes a boolean key result to a 0/1 range regardless of the values sent", async () => {
      const owner = await createTestUser("kr-boolean@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);

      const res = await keyResultsHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/key-results",
          body: { objectiveId: objective.id, title: "Launched?", metricType: "boolean", startValue: 5, targetValue: 500, currentValue: true },
        })
      );
      expect(res.status).toBe(201);
      const { keyResult } = await jsonBody<{ keyResult: any }>(res);
      expect(Number(keyResult.start_value)).toBe(0);
      expect(Number(keyResult.target_value)).toBe(1);
      expect(Number(keyResult.current_value)).toBe(1);
    });

    it("rejects a missing title", async () => {
      const owner = await createTestUser("kr-notitle@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const res = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id } })
      );
      expect(res.status).toBe(400);
    });

    it("rejects an invalid metric type", async () => {
      const owner = await createTestUser("kr-badmetric@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const res = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "Bad", metricType: "furlongs" } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from adding a key result to someone else's objective", async () => {
      const owner = await createTestUser("kr-owner@example.com");
      const stranger = await createTestUser("kr-stranger@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const res = await keyResultsHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });

    it("404s on an objectiveId that does not exist", async () => {
      const owner = await createTestUser("kr-noobjective@example.com");
      const res = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: crypto.randomUUID(), title: "Orphan" } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/key-results", () => {
    it("updates values and recomputes progress on the parent objective", async () => {
      const owner = await createTestUser("kr-update@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const create = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "New signups", startValue: 0, targetValue: 100 } })
      );
      const { keyResult } = await jsonBody<{ keyResult: any }>(create);

      const res = await keyResultsHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/key-results", body: { id: keyResult.id, currentValue: 60 } })
      );
      expect(res.status).toBe(200);
      const { keyResult: updated } = await jsonBody<{ keyResult: any }>(res);
      expect(Number(updated.current_value)).toBe(60);

      const objRes = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      const { objectives } = await jsonBody<{ objectives: any[] }>(objRes);
      expect(objectives[0].progress).toBe(60);
    });

    it("rejects an invalid metric type on update", async () => {
      const owner = await createTestUser("kr-updatebadmetric@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const create = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "New signups" } })
      );
      const { keyResult } = await jsonBody<{ keyResult: any }>(create);
      const res = await keyResultsHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/key-results", body: { id: keyResult.id, metricType: "furlongs" } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from updating someone else's key result", async () => {
      const owner = await createTestUser("kr-patchowner@example.com");
      const stranger = await createTestUser("kr-patchstranger@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const create = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "New signups" } })
      );
      const { keyResult } = await jsonBody<{ keyResult: any }>(create);
      const res = await keyResultsHandler(
        asUser(stranger, { method: "PATCH", url: "https://tasketra.com/api/key-results", body: { id: keyResult.id, currentValue: 99 } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/key-results", () => {
    it("removes the key result from its parent objective's list", async () => {
      const owner = await createTestUser("kr-delete@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const create = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "Doomed" } })
      );
      const { keyResult } = await jsonBody<{ keyResult: any }>(create);

      const res = await keyResultsHandler(
        asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/key-results?id=${keyResult.id}` })
      );
      expect(res.status).toBe(200);

      const objRes = await objectivesHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/objectives?projectId=${project.id}` }));
      const { objectives } = await jsonBody<{ objectives: any[] }>(objRes);
      expect(objectives[0].key_results).toHaveLength(0);
    });

    it("blocks a stranger from deleting someone else's key result", async () => {
      const owner = await createTestUser("kr-deleteowner@example.com");
      const stranger = await createTestUser("kr-deletestranger@example.com");
      const project = await createTestProject(owner.id);
      const objective = await createObjective(owner, project.id);
      const create = await keyResultsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/key-results", body: { objectiveId: objective.id, title: "Protected" } })
      );
      const { keyResult } = await jsonBody<{ keyResult: any }>(create);

      const res = await keyResultsHandler(
        asUser(stranger, { method: "DELETE", url: `https://tasketra.com/api/key-results?id=${keyResult.id}` })
      );
      expect(res.status).toBe(404);
    });
  });
});
