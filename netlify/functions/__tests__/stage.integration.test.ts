import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import stageHandler from "../stage.mts";
import projectHandler from "../project.mts";

const get = (user: { cookie: string }, projectId: string) =>
  stageHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${projectId}` }));
const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));

describe("project stage", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("defaults a project to Plan and reports it on GET /api/project", async () => {
    const owner = await createTestUser("stage-default@example.com");
    const project = await createTestProject(owner.id);
    const res = await projectHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/project?id=${project.id}` }));
    const { project: p } = await jsonBody<{ project: any }>(res);
    expect(p.stage).toBe("plan");
  });

  it("lets the owner change stage in either direction and logs it", async () => {
    const owner = await createTestUser("stage-owner@example.com");
    const project = await createTestProject(owner.id);
    let res = await patch(owner, { id: project.id, stage: "execute" });
    expect(res.status).toBe(200);
    expect((await jsonBody<{ project: any }>(res)).project.stage).toBe("execute");
    res = await patch(owner, { id: project.id, stage: "plan" });
    expect((await jsonBody<{ project: any }>(res)).project.stage).toBe("plan");

    const rows = await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id} ORDER BY created_at`;
    expect(rows.map((r: any) => r.summary)).toEqual(expect.arrayContaining(["stage changed to Execute", "stage changed to Plan"]));
  });

  it("rejects an unknown stage and leaves the project unchanged", async () => {
    const owner = await createTestUser("stage-bad@example.com");
    const project = await createTestProject(owner.id);
    const res = await patch(owner, { id: project.id, stage: "launch" });
    expect(res.status).toBe(400);
    const [row] = await db().sql`SELECT stage FROM projects WHERE id = ${project.id}`;
    expect(row.stage).toBe("plan");
  });

  it("does not let a stranger change the stage", async () => {
    const owner = await createTestUser("stage-owner2@example.com");
    const stranger = await createTestUser("stage-stranger@example.com");
    const project = await createTestProject(owner.id);
    const res = await patch(stranger, { id: project.id, stage: "close" });
    expect(res.status).toBe(404);
  });

  it("does not disturb other fields when only the stage changes", async () => {
    const owner = await createTestUser("stage-fields@example.com");
    const project = await createTestProject(owner.id, "Keep my name");
    await patch(owner, { id: project.id, stage: "close" });
    const [row] = await db().sql`SELECT name, stage FROM projects WHERE id = ${project.id}`;
    expect(row).toMatchObject({ name: "Keep my name", stage: "close" });
  });

  describe("GET /api/stage", () => {
    it("derives the plan checklist from real project data", async () => {
      const owner = await createTestUser("stage-plan@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`
        INSERT INTO tasks (project_id, title, due_date) VALUES
          (${project.id}, 'A', '2026-11-01'), (${project.id}, 'B', NULL), (${project.id}, 'C', '2026-11-05'), (${project.id}, 'D', NULL)
      `;
      await database.sql`INSERT INTO stakeholders (project_id, name) VALUES (${project.id}, 'Dana')`;
      await database.sql`INSERT INTO risks (project_id, title) VALUES (${project.id}, 'Vendor slips')`;
      await database.sql`UPDATE projects SET budget_at_completion = 100000 WHERE id = ${project.id}`;

      const res = await get(owner, project.id);
      expect(res.status).toBe(200);
      const data = await jsonBody<any>(res);
      expect(data.stage).toBe("plan");
      const byId = Object.fromEntries(data.checklist.items.map((i: any) => [i.id, i]));
      expect(byId.wbs.status).toBe("done");
      expect(byId.schedule).toMatchObject({ status: "partial", meta: "2 of 4 tasks have dates. 2 still need one." });
      expect(byId.stakeholders.status).toBe("done");
      expect(byId.budget.status).toBe("done");
      expect(byId.risks.status).toBe("done");
      expect(data.checklist.done).toBe(4);
    });

    it("ignores soft-deleted tasks, risks and stakeholders", async () => {
      const owner = await createTestUser("stage-deleted@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await database.sql`INSERT INTO tasks (project_id, title, deleted_at) VALUES (${project.id}, 'Gone', now())`;
      await database.sql`INSERT INTO risks (project_id, title, deleted_at) VALUES (${project.id}, 'Gone', now())`;
      await database.sql`INSERT INTO stakeholders (project_id, name, deleted_at) VALUES (${project.id}, 'Gone', now())`;
      const data = await jsonBody<any>(await get(owner, project.id));
      expect(data.checklist.done).toBe(0);
    });

    it("builds the execute check and band from blocked tasks, change requests and status updates", async () => {
      const owner = await createTestUser("stage-exec@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await patch(owner, { id: project.id, stage: "execute" });
      await database.sql`INSERT INTO tasks (project_id, title, status) VALUES (${project.id}, 'Stuck', 'blocked'), (${project.id}, 'Stuck 2', 'blocked')`;
      await database.sql`INSERT INTO change_requests (project_id, title) VALUES (${project.id}, 'Move go-live')`;
      await database.sql`INSERT INTO status_updates (project_id, body) VALUES (${project.id}, 'On track')`;
      await database.sql`INSERT INTO risks (project_id, title, updated_at) VALUES (${project.id}, 'Old risk', now() - interval '45 days')`;

      const data = await jsonBody<any>(await get(owner, project.id));
      expect(data.checklist.title).toBe("This week's check");
      const byId = Object.fromEntries(data.checklist.items.map((i: any) => [i.id, i]));
      expect(byId.changes.status).toBe("todo");
      expect(byId["risk-review"].status).toBe("todo");
      expect(byId.status.status).toBe("done");
      expect(data.band).toEqual({ state: "attention", message: "2 blocked tasks and 1 open change request" });
    });

    it("computes the cost index for the budget row when a baseline and costs exist", async () => {
      const owner = await createTestUser("stage-cpi@example.com");
      const project = await createTestProject(owner.id);
      const database = db();
      await patch(owner, { id: project.id, stage: "execute" });
      await database.sql`UPDATE projects SET budget_at_completion = 1000 WHERE id = ${project.id}`;
      await database.sql`INSERT INTO tasks (project_id, title, status) VALUES (${project.id}, 'A', 'done'), (${project.id}, 'B', 'not_started')`;
      await database.sql`INSERT INTO cost_entries (project_id, description, amount, incurred_date) VALUES (${project.id}, 'Work', 250, CURRENT_DATE)`;
      const data = await jsonBody<any>(await get(owner, project.id));
      const budget = data.checklist.items.find((i: any) => i.id === "budget-check");
      expect(budget.status).toBe("done");
      expect(budget.meta).toContain("Cost index 2.00");
    });

    it("counts checked closure items on the close stage", async () => {
      const owner = await createTestUser("stage-close@example.com");
      const project = await createTestProject(owner.id);
      await patch(owner, { id: project.id, stage: "close", closureChecklist: { finalLessons: true, budgetReconciled: true, stakeholderSignoff: false } });
      const data = await jsonBody<any>(await get(owner, project.id));
      const closure = data.checklist.items.find((i: any) => i.id === "closure");
      expect(closure).toMatchObject({ status: "partial", meta: "2 of 5 items checked" });
    });

    it("404s for someone without access and 400s without a projectId", async () => {
      const owner = await createTestUser("stage-a@example.com");
      const stranger = await createTestUser("stage-b@example.com");
      const project = await createTestProject(owner.id);
      expect((await get(stranger, project.id)).status).toBe(404);
      const res = await stageHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/stage" }));
      expect(res.status).toBe(400);
    });
  });
});
