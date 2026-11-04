import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import workloadHandler from "../workload.mts";

// Direct inserts for the entities the workload grid reads, mirroring each
// entity's own migration schema. Their handlers have their own tests; here
// they only seed state. Task due dates use fixed past/future dates
// (2026-10-* past, 2026-12-* future, against a "today" in early November
// 2026); milestone dates are computed from the endpoint's window rule,
// because the window is anchored to the real current week.

function expectedWindowStart(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function addDaysKey(key: string, n: number): string {
  const [y, m, dd] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

async function insertTask(
  projectId: string,
  opts: {
    title?: string;
    status?: string;
    dueDate?: string | null;
    parentId?: string;
    ownerName?: string | null;
    stakeholderId?: string | null;
    deleted?: boolean;
  } = {},
) {
  const database = db();
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO tasks (project_id, title, status, due_date, parent_task_id, owner_name, stakeholder_id, deleted_at)
    VALUES (
      ${projectId}, ${opts.title ?? "Seed task"}, ${opts.status ?? "not_started"},
      ${opts.dueDate ?? null}, ${opts.parentId ?? null}, ${opts.ownerName ?? null},
      ${opts.stakeholderId ?? null}, ${opts.deleted ? new Date().toISOString() : null}
    )
    RETURNING id
  `;
  return row.id;
}

async function insertStakeholder(projectId: string, name: string) {
  const database = db();
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO stakeholders (project_id, name) VALUES (${projectId}, ${name}) RETURNING id
  `;
  return row.id;
}

async function insertMilestone(
  projectId: string,
  opts: { title?: string; type?: string; status?: string; startDate: string },
) {
  const database = db();
  await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, status, start_date)
    VALUES (${projectId}, ${opts.type ?? "milestone"}, ${opts.title ?? "Seed milestone"}, ${opts.status ?? "not_started"}, ${opts.startDate})
  `;
}

async function insertIssue(projectId: string, opts: { severity?: string; status?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO issues (project_id, title, severity, status)
    VALUES (${projectId}, 'Seed issue', ${opts.severity ?? "medium"}, ${opts.status ?? "open"})
  `;
}

const get = (user: { cookie: string }) =>
  workloadHandler(asUser(user, { method: "GET", url: "https://tasketra.com/api/workload" }));

describe("workload", () => {
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
    const anon = await workloadHandler(new Request("https://tasketra.com/api/workload"));
    expect(anon.status).toBe(401);
    const user = await createTestUser("wl-auth@example.com");
    const post = await workloadHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/workload", body: {} }));
    expect(post.status).toBe(405);
  });

  it("returns empty lists and the current Sunday window start for a user with no projects", async () => {
    const user = await createTestUser("wl-empty@example.com");
    const res = await get(user);
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);
    expect(data.tasks).toEqual([]);
    expect(data.milestones).toEqual([]);
    expect(data.windowStart).toBe(expectedWindowStart());
  });

  it("resolves owners in order: trimmed owner_name beats the stakeholder name, which beats Unassigned", async () => {
    const user = await createTestUser("wl-owner@example.com");
    const project = await createTestProject(user.id, "Owners");
    const stakeholderId = await insertStakeholder(project.id, "Stake Holder");

    await insertTask(project.id, { title: "Named wins", ownerName: "  Alice A  ", stakeholderId, dueDate: "2026-12-01" });
    await insertTask(project.id, { title: "Blank name falls back", ownerName: "   ", stakeholderId, dueDate: "2026-12-02" });
    await insertTask(project.id, { title: "Stakeholder only", stakeholderId, dueDate: "2026-12-03" });
    await insertTask(project.id, { title: "Nobody", dueDate: null });

    const data = await jsonBody<any>(await get(user));
    expect(data.tasks).toHaveLength(4);
    const byDue = new Map<string, any>(data.tasks.map((t: any) => [t.dueDate ?? "none", t]));
    expect(byDue.get("2026-12-01").owner).toBe("Alice A");
    expect(byDue.get("2026-12-02").owner).toBe("Stake Holder");
    expect(byDue.get("2026-12-03").owner).toBe("Stake Holder");
    const nobody = data.tasks.find((t: any) => t.dueDate === null);
    expect(nobody.owner).toBe("Unassigned");
    expect(nobody.projectId).toBe(project.id);
    expect(nobody.projectName).toBe("Owners");
  });

  it("serializes due dates as YYYY-MM-DD strings and keeps null due dates null", async () => {
    const user = await createTestUser("wl-dates@example.com");
    const project = await createTestProject(user.id, "Dates");
    await insertTask(project.id, { title: "Dated", dueDate: "2026-12-01" });
    await insertTask(project.id, { title: "Undated", dueDate: null });

    const data = await jsonBody<any>(await get(user));
    const dated = data.tasks.find((t: any) => t.dueDate !== null);
    expect(dated.dueDate).toBe("2026-12-01");
    expect(typeof dated.dueDate).toBe("string");
    expect(data.tasks.some((t: any) => t.dueDate === null)).toBe(true);
  });

  it("includes open leaf tasks only: parents, done tasks and deleted tasks are out", async () => {
    const user = await createTestUser("wl-leaf@example.com");
    const project = await createTestProject(user.id, "Leaves");
    const parentId = await insertTask(project.id, { title: "Parent", dueDate: "2026-12-01" });
    await insertTask(project.id, { title: "Child", dueDate: "2026-12-02", parentId });
    await insertTask(project.id, { title: "Done leaf", status: "done", dueDate: "2026-12-03" });
    await insertTask(project.id, { title: "Deleted leaf", dueDate: "2026-12-04", deleted: true });
    await insertTask(project.id, { title: "Plain leaf", dueDate: "2026-12-05" });

    const data = await jsonBody<any>(await get(user));
    expect(data.tasks.map((t: any) => t.dueDate).sort()).toEqual(["2026-12-02", "2026-12-05"]);
  });

  it("includes projects the user is an active member of, and nothing for a stranger", async () => {
    const owner = await createTestUser("wl-member-owner@example.com");
    const member = await createTestUser("wl-member@example.com");
    const stranger = await createTestUser("wl-stranger@example.com");
    const project = await createTestProject(owner.id, "Shared");
    await insertTask(project.id, { title: "Shared task", dueDate: "2026-12-01" });

    let data = await jsonBody<any>(await get(member));
    expect(data.tasks).toEqual([]);

    const database = db();
    await database.sql`
      INSERT INTO project_members (project_id, user_id, invited_email, status)
      VALUES (${project.id}, ${member.id}, ${member.email}, 'active')
    `;
    data = await jsonBody<any>(await get(member));
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].projectName).toBe("Shared");

    data = await jsonBody<any>(await get(stranger));
    expect(data.tasks).toEqual([]);
    expect(data.milestones).toEqual([]);
  });

  it("excludes archived and closed projects from tasks and milestones", async () => {
    const user = await createTestUser("wl-hidden@example.com");
    const archived = await createTestProject(user.id, "Archived");
    const closed = await createTestProject(user.id, "Closed");
    const live = await createTestProject(user.id, "Live");
    const start = expectedWindowStart();
    for (const p of [archived, closed, live]) {
      await insertTask(p.id, { title: `${p.name} task`, dueDate: "2026-12-01" });
      await insertMilestone(p.id, { title: `${p.name} milestone`, startDate: addDaysKey(start, 2) });
    }
    const database = db();
    await database.sql`UPDATE projects SET archived = true WHERE id = ${archived.id}`;
    await database.sql`UPDATE projects SET closed_at = now() WHERE id = ${closed.id}`;

    const data = await jsonBody<any>(await get(user));
    expect(data.tasks.map((t: any) => t.projectName)).toEqual(["Live"]);
    expect(data.milestones.map((ms: any) => ms.title)).toEqual(["Live milestone"]);
  });

  it("carries each project's computed health on its tasks", async () => {
    const user = await createTestUser("wl-health@example.com");
    const healthy = await createTestProject(user.id, "Healthy");
    const troubled = await createTestProject(user.id, "Troubled");
    await insertTask(healthy.id, { title: "Future task", dueDate: "2026-12-01", ownerName: "Alice" });
    await insertTask(troubled.id, { title: "Future task", dueDate: "2026-12-01", ownerName: "Alice" });
    // A critical open issue makes the computed health off track, the same
    // verdict the portfolio gives.
    await insertIssue(troubled.id, { severity: "critical", status: "open" });

    const data = await jsonBody<any>(await get(user));
    const byProject = new Map(data.tasks.map((t: any) => [t.projectId, t.projectHealth]));
    expect(byProject.get(healthy.id)).toBe("on_track");
    expect(byProject.get(troubled.id)).toBe("off_track");
  });

  it("returns only the milestones inside the four-week window: open milestones, in range", async () => {
    const user = await createTestUser("wl-window@example.com");
    const project = await createTestProject(user.id, "Window");
    const start = expectedWindowStart();
    await insertMilestone(project.id, { title: "First day", startDate: start });
    await insertMilestone(project.id, { title: "Last day", startDate: addDaysKey(start, 27) });
    await insertMilestone(project.id, { title: "Day after the window", startDate: addDaysKey(start, 28) });
    await insertMilestone(project.id, { title: "Day before the window", startDate: addDaysKey(start, -1) });
    await insertMilestone(project.id, { title: "Done in window", status: "done", startDate: addDaysKey(start, 3) });
    await insertMilestone(project.id, { title: "Release, not a milestone", type: "release", startDate: addDaysKey(start, 4) });

    const data = await jsonBody<any>(await get(user));
    expect(data.windowStart).toBe(start);
    expect(data.milestones.map((ms: any) => ms.title)).toEqual(["First day", "Last day"]);
    expect(data.milestones[0].date).toBe(start);
    expect(data.milestones[0].projectName).toBe("Window");
  });
});
