import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import feedHandler from "../feed.mts";
import decisionsHandler from "../decisions.mts";
import tasksHandler from "../tasks.mts";
import issuesHandler from "../issues.mts";
import risksHandler from "../risks.mts";

// v150: a newly created decision used to appear in the feed twice — once as
// the derived decision_request row and once as the activity_log
// decision/created row. The feed now drops the activity copy.
describe("feed decision de-duplication", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("shows a created decision once, not twice", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;

    const res = await decisionsHandler(asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/decisions",
      body: { projectId, title: "Pick a date", context: "", options: ["Nov 20", "Nov 27"], stakeholderIds: [] },
    }));
    expect(res.status).toBe(201);

    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    expect(feedRes.status).toBe(200);
    const body = await jsonBody(feedRes);
    const aboutDecision = body.feed.filter((f: any) => f.title === "Pick a date");
    expect(aboutDecision).toHaveLength(1);
    expect(aboutDecision[0].type).toBe("decision_request");
  });

  it("shows a created task, issue and risk once each, with a human status", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;

    const post = (handler: any, path: string, title: string) =>
      handler(asUser(owner, { method: "POST", url: `https://app.tasketra.com/api/${path}`, body: { projectId, title } }));
    expect((await post(tasksHandler, "tasks", "Book the venue")).status).toBe(201);
    expect((await post(issuesHandler, "issues", "Vendor is late")).status).toBe(201);
    expect((await post(risksHandler, "risks", "Budget overrun")).status).toBe(201);

    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    const body = await jsonBody(feedRes);
    for (const [title, type] of [["Book the venue", "task"], ["Vendor is late", "issue"], ["Budget overrun", "risk"]] as const) {
      const rows = body.feed.filter((f: any) => f.title === title);
      expect(rows, title).toHaveLength(1);
      expect(rows[0].type).toBe(type);
      expect(rows[0].body).not.toMatch(/_/); // human label, not the raw enum
    }
  });

  // v151 (Part C2): updates doubled the same way creations did -- the
  // derived branch re-surfaces the entity at updated_at and the activity
  // branch carried the "updated" copy. One row per entity after an update.
  it("shows an updated task, issue and risk once each", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;

    const post = async (handler: any, path: string, title: string) => {
      const res = await handler(asUser(owner, { method: "POST", url: `https://app.tasketra.com/api/${path}`, body: { projectId, title } }));
      expect(res.status).toBe(201);
      return jsonBody(res);
    };
    const task = (await post(tasksHandler, "tasks", "Book the venue")).task;
    const issue = (await post(issuesHandler, "issues", "Vendor is late")).issue;
    const risk = (await post(risksHandler, "risks", "Budget overrun")).risk;

    const patch = async (handler: any, path: string, id: string, status: string) => {
      const res = await handler(asUser(owner, { method: "PATCH", url: `https://app.tasketra.com/api/${path}`, body: { id, status } }));
      expect(res.status).toBe(200);
    };
    await patch(tasksHandler, "tasks", task.id, "in_progress");
    await patch(issuesHandler, "issues", issue.id, "in_progress");
    await patch(risksHandler, "risks", risk.id, "monitoring");

    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    const body = await jsonBody(feedRes);
    for (const [title, type, label] of [["Book the venue", "task", "In progress"], ["Vendor is late", "issue", "In progress"], ["Budget overrun", "risk", "Monitoring"]] as const) {
      const rows = body.feed.filter((f: any) => f.title === title);
      expect(rows, title).toHaveLength(1);
      expect(rows[0].type).toBe(type);
      expect(rows[0].body).toBe(label);
    }
    // The humanized diff is not lost -- it lives in the activity summary the
    // update stored (My activity reads the same table).
    const [row] = await db().sql`SELECT summary FROM activity_log WHERE entity_type = 'task' AND action = 'updated'`;
    expect(row.summary).toBe("status: Not started → In progress");
  });

  it("still shows a task deletion as an activity row", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;
    const res = await tasksHandler(asUser(owner, { method: "POST", url: "https://app.tasketra.com/api/tasks", body: { projectId, title: "Doomed task" } }));
    const { task } = await jsonBody(res);
    const del = await tasksHandler(asUser(owner, { method: "DELETE", url: `https://app.tasketra.com/api/tasks?id=${task.id}` }));
    expect(del.status).toBe(200);

    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    const body = await jsonBody(feedRes);
    const rows = body.feed.filter((f: any) => f.title === "Doomed task");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("activity");
    expect(rows[0].meta.action).toBe("deleted");
  });

  it("still shows other activity entries (a decision deletion is not hidden)", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;
    await db().sql`
      INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id)
      VALUES (${projectId}, 'decision', gen_random_uuid(), 'Old question', 'deleted', ${owner.id})
    `;
    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    const body = await jsonBody(feedRes);
    const item = body.feed.find((f: any) => f.type === "activity" && f.title === "Old question");
    expect(item).toBeTruthy();
  });
});
