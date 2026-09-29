import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import baselineHandler from "../baseline.mts";
import budgetHandler from "../budget.mts";
import stageHandler from "../stage.mts";

const read = async (user: { cookie: string }, projectId: string) =>
  jsonBody<any>(await baselineHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/baseline?projectId=${projectId}` })));
const lock = (user: { cookie: string }, projectId: string) =>
  baselineHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/baseline", body: { projectId } }));
const setBudget = (user: { cookie: string }, projectId: string, bac: number | null, reserve: number | null = null) =>
  budgetHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/budget", body: { projectId, budgetAtCompletion: bac, contingencyReserve: reserve } }));

describe("project baseline", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts unlocked and reports what it would capture", async () => {
    const owner = await createTestUser("bl-none@example.com");
    const project = await createTestProject(owner.id, "P");
    await db().sql`INSERT INTO tasks (project_id, title, due_date) VALUES (${project.id}, 'A', '2026-10-05'), (${project.id}, 'B', NULL)`;
    await setBudget(owner, project.id, 50000, 5000);
    const data = await read(owner, project.id);
    expect(data.baseline).toBeNull();
    expect(data.variance).toBeNull();
    expect(data.current).toMatchObject({ taskCount: 2, datedTaskCount: 1, budget: 50000, reserve: 5000 });
  });

  it("locks a snapshot, then shows drift in dates, tasks and budget", async () => {
    const owner = await createTestUser("bl-drift@example.com");
    const project = await createTestProject(owner.id, "P");
    const database = db();
    await database.sql`INSERT INTO tasks (project_id, title, due_date) VALUES (${project.id}, 'A', '2026-10-05'), (${project.id}, 'B', '2026-10-10')`;
    await setBudget(owner, project.id, 50000, 5000);

    const res = await lock(owner, project.id);
    expect(res.status).toBe(201);
    let data = await jsonBody<any>(res);
    expect(data.baseline).toMatchObject({ budget: 50000, reserve: 5000, taskCount: 2, datedTaskCount: 2 });
    expect(data.variance.movedTasks).toEqual([]);

    await database.sql`UPDATE tasks SET due_date = '2026-10-20' WHERE title = 'A'`;
    await database.sql`UPDATE tasks SET deleted_at = now() WHERE title = 'B'`;
    await database.sql`INSERT INTO tasks (project_id, title) VALUES (${project.id}, 'C')`;
    await setBudget(owner, project.id, 55000, 5000);

    data = await read(owner, project.id);
    expect(data.variance.movedTasks).toHaveLength(1);
    expect(data.variance.movedTasks[0]).toMatchObject({ title: "A", baselineDue: "2026-10-05", due: "2026-10-20" });
    expect(data.variance.addedTasks).toBe(1);
    expect(data.variance.removedTasks).toBe(1);
    expect(data.variance.budget).toEqual({ baseline: 50000, current: 55000, delta: 5000 });
  });

  it("keeps earlier baselines when it is locked again", async () => {
    const owner = await createTestUser("bl-relock@example.com");
    const project = await createTestProject(owner.id, "P");
    await lock(owner, project.id);
    await setBudget(owner, project.id, 1000);
    await lock(owner, project.id);
    const data = await read(owner, project.id);
    expect(data.history).toHaveLength(2);
    expect(data.baseline.budget).toBe(1000);
    const rows = await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id} ORDER BY created_at`;
    const summaries = rows.map((r: any) => r.summary);
    expect(summaries).toContain("baseline locked");
    expect(summaries).toContain("baseline re-locked");
  });

  it("only the owner can lock, and strangers cannot read", async () => {
    const owner = await createTestUser("bl-owner@example.com");
    const stranger = await createTestUser("bl-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await lock(stranger, project.id)).status).toBe(404);
    expect((await baselineHandler(asUser(stranger, { method: "GET", url: `https://tasketra.com/api/baseline?projectId=${project.id}` }))).status).toBe(404);
  });

  it("logs a budget edit made after the lock, but not before it", async () => {
    const owner = await createTestUser("bl-audit@example.com");
    const project = await createTestProject(owner.id, "P");
    const summaries = async () => (await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id}`).map((r: any) => r.summary);
    await setBudget(owner, project.id, 100);
    expect(await summaries()).not.toContain("budget changed after the baseline was locked");
    await lock(owner, project.id);
    await setBudget(owner, project.id, 100);
    expect(await summaries()).not.toContain("budget changed after the baseline was locked");
    await setBudget(owner, project.id, 200);
    expect(await summaries()).toContain("budget changed after the baseline was locked");
  });

  it("marks the Plan checklist row done once locked", async () => {
    const owner = await createTestUser("bl-stage@example.com");
    const project = await createTestProject(owner.id, "P");
    const row = async () => {
      const d = await jsonBody<any>(await stageHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${project.id}` })));
      return d.checklist.items.find((i: any) => i.id === "baseline");
    };
    expect((await row()).status).toBe("todo");
    await lock(owner, project.id);
    expect((await row()).status).toBe("done");
  });
});
