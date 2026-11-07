import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../today.mts";

// v150: /api/today carries the fields the project home's Next Step card
// reasons over (overdue tasks, dated-task count, stakeholder count, and the
// newest check-in time).
describe("today next-step fields", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  async function setup() {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    return { owner, projectId: project.id };
  }

  it("reports zeros and a null check-in for a brand-new project", async () => {
    const { owner, projectId } = await setup();
    const res = await handler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/today?projectId=${projectId}` }));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.totalTaskCount).toBe(0);
    expect(body.openTasks).toEqual([]);
    expect(body.openTaskCount).toBe(0);
    expect(body.datedTaskCount).toBe(0);
    expect(body.stakeholderCount).toBe(0);
    expect(body.lastCheckInAt).toBeNull();
    expect(body.overdueTasks).toEqual([]);
  });

  it("counts dated tasks and stakeholders, lists overdue, and timestamps the last check-in", async () => {
    const { owner, projectId } = await setup();
    await db().sql`
      INSERT INTO tasks (project_id, title, status, due_date) VALUES
        (${projectId}, 'Overdue one', 'not_started', CURRENT_DATE - 3),
        (${projectId}, 'Future one', 'not_started', CURRENT_DATE + 10),
        (${projectId}, 'Undated one', 'not_started', NULL),
        (${projectId}, 'Done overdue', 'done', CURRENT_DATE - 5)
    `;
    await db().sql`INSERT INTO stakeholders (project_id, name) VALUES (${projectId}, 'Sponsor Sam')`;
    await db().sql`INSERT INTO status_updates (project_id, body) VALUES (${projectId}, 'Kickoff done')`;

    const res = await handler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/today?projectId=${projectId}` }));
    const body = await jsonBody(res);
    expect(body.totalTaskCount).toBe(4);
    expect(body.datedTaskCount).toBe(3);
    expect(body.stakeholderCount).toBe(1);
    expect(body.overdueTasks.map((t: any) => t.title)).toEqual(["Overdue one"]);
    expect(body.lastCheckInAt).toBeTruthy();
    // v151: open = status != 'done' and not deleted, every row counts. The
    // list is dated-first by due date, undated last; done tasks never appear.
    expect(body.openTaskCount).toBe(3);
    expect(body.openTasks.map((t: any) => t.title)).toEqual(["Overdue one", "Future one", "Undated one"]);
  });

  it("orders open tasks dated-first, then in-progress before not-started", async () => {
    const { owner, projectId } = await setup();
    await db().sql`
      INSERT INTO tasks (project_id, title, status, due_date, created_at) VALUES
        (${projectId}, 'Undated not started', 'not_started', NULL, now() - interval '2 days'),
        (${projectId}, 'Undated in progress', 'in_progress', NULL, now() - interval '1 day'),
        (${projectId}, 'Dated later', 'not_started', CURRENT_DATE + 5, now()),
        (${projectId}, 'Deleted open', 'not_started', CURRENT_DATE + 1, now())
    `;
    await db().sql`UPDATE tasks SET deleted_at = now() WHERE title = 'Deleted open'`;

    const res = await handler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/today?projectId=${projectId}` }));
    const body = await jsonBody(res);
    expect(body.openTaskCount).toBe(3);
    expect(body.openTasks.map((t: any) => t.title)).toEqual(["Dated later", "Undated in progress", "Undated not started"]);
  });
});
