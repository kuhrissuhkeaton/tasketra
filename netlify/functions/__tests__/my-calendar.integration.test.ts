import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import calendarHandler from "../my-calendar.mts";

// Direct inserts for the three dated entities the calendar reads, mirroring
// each entity's own migration schema. Their handlers have their own tests;
// here they only seed dates.

async function insertTask(projectId: string, opts: { title?: string; status?: string; dueDate?: string | null; parentId?: string } = {}) {
  const database = db();
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO tasks (project_id, title, status, due_date, parent_task_id)
    VALUES (${projectId}, ${opts.title ?? "Seed task"}, ${opts.status ?? "not_started"}, ${opts.dueDate ?? null}, ${opts.parentId ?? null})
    RETURNING id
  `;
  return row.id;
}

async function insertRoadmapItem(projectId: string, opts: { type?: string; title?: string; startDate?: string | null; status?: string; deleted?: boolean } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, start_date, status, deleted_at)
    VALUES (${projectId}, ${opts.type ?? "milestone"}, ${opts.title ?? "Seed milestone"}, ${opts.startDate ?? null}, ${opts.status ?? "not_started"}, ${opts.deleted ? new Date().toISOString() : null})
  `;
}

let tokenSeq = 0;
async function insertDecision(projectId: string, opts: { title?: string; status?: string; deadline?: string | null; createdAt?: string } = {}) {
  const database = db();
  tokenSeq += 1;
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO decision_requests (project_id, title, options, deadline, public_token, status, created_at)
    VALUES (${projectId}, ${opts.title ?? "Seed decision"}, ${JSON.stringify(["A", "B"])}, ${opts.deadline ?? null}, ${`tok-${tokenSeq}`}, ${opts.status ?? "open"}, ${opts.createdAt ?? new Date().toISOString()})
    RETURNING id
  `;
  return row.id;
}

const RANGE = "from=2026-11-01&to=2026-11-30";
const get = (user: { cookie: string }, qs: string = RANGE) =>
  calendarHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/my-calendar?${qs}` }));

describe("my-calendar", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects unauthenticated and non-GET requests", async () => {
    const anon = await calendarHandler(new Request("https://tasketra.com/api/my-calendar"));
    expect(anon.status).toBe(401);
    const user = await createTestUser("mc-auth@example.com");
    const post = await calendarHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/my-calendar", body: {} }));
    expect(post.status).toBe(405);
  });

  it("returns an empty list for a user with no projects", async () => {
    const user = await createTestUser("mc-empty@example.com");
    const res = await get(user);
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);
    expect(data.items).toEqual([]);
    expect(data.from).toBe("2026-11-01");
    expect(data.to).toBe("2026-11-30");
  });

  it("returns tasks, milestones and waiting decisions in range, and nothing outside it", async () => {
    const user = await createTestUser("mc-main@example.com");
    const project = await createTestProject(user.id, "Calendar Project");
    await insertTask(project.id, { title: "Due task", dueDate: "2026-11-10" });
    await insertTask(project.id, { title: "Out of range task", dueDate: "2026-12-15" });
    await insertTask(project.id, { title: "Undated task", dueDate: null });
    await insertRoadmapItem(project.id, { title: "Launch day", startDate: "2026-11-20" });
    await insertDecision(project.id, { title: "Pick a vendor", deadline: "2026-11-12" });

    const data = await jsonBody<any>(await get(user));
    expect(data.items.map((i: any) => [i.kind, i.title, i.date])).toEqual([
      ["task", "Due task", "2026-11-10"],
      ["decision", "Pick a vendor", "2026-11-12"],
      ["milestone", "Launch day", "2026-11-20"],
    ]);
    expect(data.items[0].project_name).toBe("Calendar Project");
  });

  it("excludes other users' projects and includes projects the user is an active member of", async () => {
    const user = await createTestUser("mc-member@example.com");
    const outsider = await createTestUser("mc-outsider@example.com");
    const theirs = await createTestProject(outsider.id, "Theirs");
    await insertTask(theirs.id, { title: "Not yours", dueDate: "2026-11-10" });

    let data = await jsonBody<any>(await get(user));
    expect(data.items).toEqual([]);

    const database = db();
    await database.sql`
      INSERT INTO project_members (project_id, user_id, invited_email, status)
      VALUES (${theirs.id}, ${user.id}, ${user.email}, 'active')
    `;
    data = await jsonBody<any>(await get(user));
    expect(data.items.map((i: any) => i.title)).toEqual(["Not yours"]);
  });

  it("excludes archived and closed projects", async () => {
    const user = await createTestUser("mc-hidden@example.com");
    const archived = await createTestProject(user.id, "Archived");
    const closed = await createTestProject(user.id, "Closed");
    await insertTask(archived.id, { title: "Archived task", dueDate: "2026-11-10" });
    await insertTask(closed.id, { title: "Closed task", dueDate: "2026-11-10" });
    const database = db();
    await database.sql`UPDATE projects SET archived = true WHERE id = ${archived.id}`;
    await database.sql`UPDATE projects SET closed_at = now() WHERE id = ${closed.id}`;

    const data = await jsonBody<any>(await get(user));
    expect(data.items).toEqual([]);
  });

  it("leaves out done tasks and parent tasks with live sub-tasks", async () => {
    const user = await createTestUser("mc-tasks@example.com");
    const project = await createTestProject(user.id, "Tasks");
    await insertTask(project.id, { title: "Done task", status: "done", dueDate: "2026-11-10" });
    const parentId = await insertTask(project.id, { title: "Parent", dueDate: "2026-11-10" });
    await insertTask(project.id, { title: "Child", dueDate: "2026-11-11", parentId });

    const data = await jsonBody<any>(await get(user));
    expect(data.items.map((i: any) => i.title)).toEqual(["Child"]);
  });

  it("shows milestones, releases and events (done ones included, muted later), but not phases, notes or deleted items", async () => {
    const user = await createTestUser("mc-roadmap@example.com");
    const project = await createTestProject(user.id, "Roadmap");
    await insertRoadmapItem(project.id, { type: "milestone", title: "Hit milestone", startDate: "2026-11-05", status: "done" });
    await insertRoadmapItem(project.id, { type: "release", title: "Release", startDate: "2026-11-06" });
    await insertRoadmapItem(project.id, { type: "event", title: "Event", startDate: "2026-11-07" });
    await insertRoadmapItem(project.id, { type: "phase", title: "Phase", startDate: "2026-11-08" });
    await insertRoadmapItem(project.id, { type: "note", title: "Note", startDate: "2026-11-09" });
    await insertRoadmapItem(project.id, { type: "milestone", title: "Deleted", startDate: "2026-11-10", deleted: true });

    const data = await jsonBody<any>(await get(user));
    expect(data.items.map((i: any) => [i.title, i.status])).toEqual([
      ["Hit milestone", "done"],
      ["Release", "not_started"],
      ["Event", "not_started"],
    ]);
  });

  it("dates a waiting decision by its deadline, else by the day it was raised, and skips resolved ones", async () => {
    const user = await createTestUser("mc-decisions@example.com");
    const project = await createTestProject(user.id, "Decisions");
    await insertDecision(project.id, { title: "Has deadline", deadline: "2026-11-12", createdAt: "2026-10-20T09:00:00Z" });
    await insertDecision(project.id, { title: "No deadline", deadline: null, createdAt: "2026-11-03T12:00:00Z" });
    await insertDecision(project.id, { title: "Resolved", status: "resolved", deadline: "2026-11-15" });

    const data = await jsonBody<any>(await get(user));
    expect(data.items.map((i: any) => [i.title, i.date, i.created_date])).toEqual([
      ["No deadline", "2026-11-03", "2026-11-03"],
      ["Has deadline", "2026-11-12", "2026-10-20"],
    ]);
  });

  it("rejects a malformed, inverted or over-wide range", async () => {
    const user = await createTestUser("mc-range@example.com");
    expect((await get(user, "from=soon&to=2026-11-30")).status).toBe(400);
    expect((await get(user, "from=2026-11-30&to=2026-11-01")).status).toBe(400);
    expect((await get(user, "from=2026-01-01&to=2026-03-31")).status).toBe(400);
    // Exactly 62 days is still fine.
    expect((await get(user, "from=2026-01-01&to=2026-03-03")).status).toBe(200);
  });
});
