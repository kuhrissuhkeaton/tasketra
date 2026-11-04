import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import syncHandler from "../weekly-sync.mts";

// Direct inserts for the entities the weekly sync reads, mirroring each
// entity's own migration schema. Their handlers have their own tests; here
// they only seed state. Dates are chosen relative to a "today" in early
// November 2026: 2026-10-* is safely past, 2026-12-* safely future.

async function insertTask(projectId: string, opts: { title?: string; status?: string; dueDate?: string | null; parentId?: string } = {}) {
  const database = db();
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO tasks (project_id, title, status, due_date, parent_task_id)
    VALUES (${projectId}, ${opts.title ?? "Seed task"}, ${opts.status ?? "not_started"}, ${opts.dueDate ?? null}, ${opts.parentId ?? null})
    RETURNING id
  `;
  return row.id;
}

let tokenSeq = 0;
async function insertDecision(projectId: string, opts: { title?: string; context?: string | null; status?: string; deadline?: string | null; createdAt?: string } = {}) {
  const database = db();
  tokenSeq += 1;
  const [row] = await database.sql<{ id: string }>`
    INSERT INTO decision_requests (project_id, title, context, options, deadline, public_token, status, created_at)
    VALUES (${projectId}, ${opts.title ?? "Seed decision"}, ${opts.context ?? null}, ${JSON.stringify(["A", "B"])}, ${opts.deadline ?? null}, ${`tok-ws-${tokenSeq}`}, ${opts.status ?? "open"}, ${opts.createdAt ?? new Date().toISOString()})
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

async function addRecipient(decisionId: string, stakeholderId: string) {
  const database = db();
  await database.sql`
    INSERT INTO decision_request_recipients (decision_request_id, stakeholder_id)
    VALUES (${decisionId}, ${stakeholderId})
  `;
}

async function insertIssue(projectId: string, opts: { severity?: string; status?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO issues (project_id, title, severity, status)
    VALUES (${projectId}, 'Seed issue', ${opts.severity ?? "medium"}, ${opts.status ?? "open"})
  `;
}

async function insertStatusUpdate(projectId: string, opts: { health?: string | null; createdAt: string }) {
  const database = db();
  await database.sql`
    INSERT INTO status_updates (project_id, body, health, created_at)
    VALUES (${projectId}, 'seed note', ${opts.health ?? null}, ${opts.createdAt})
  `;
}

async function insertActivity(projectId: string, createdAt: string) {
  const database = db();
  await database.sql`
    INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, created_at)
    VALUES (${projectId}, 'task', ${crypto.randomUUID()}, 'Seed task', 'created', ${createdAt})
  `;
}

const get = (user: { cookie: string }) =>
  syncHandler(asUser(user, { method: "GET", url: "https://tasketra.com/api/weekly-sync" }));

describe("weekly-sync", () => {
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
    const anon = await syncHandler(new Request("https://tasketra.com/api/weekly-sync"));
    expect(anon.status).toBe(401);
    const user = await createTestUser("ws-auth@example.com");
    const post = await syncHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/weekly-sync", body: {} }));
    expect(post.status).toBe(405);
  });

  it("returns empty lists for a user with no projects", async () => {
    const user = await createTestUser("ws-empty@example.com");
    const res = await get(user);
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);
    expect(data.projects).toEqual([]);
    expect(data.asks).toEqual([]);
  });

  it("rolls up the owner's project: leaf overdue count, open decisions, stated status, last activity, health", async () => {
    const user = await createTestUser("ws-owner@example.com");
    const project = await createTestProject(user.id, "Sync Project");

    // Leaf overdue: one open leaf task past due. A done one does not count,
    // and a past-due parent does not count either (its open child does).
    await insertTask(project.id, { title: "Overdue leaf", dueDate: "2026-10-01" });
    await insertTask(project.id, { title: "Done and late", status: "done", dueDate: "2026-10-01" });
    await insertTask(project.id, { title: "Future leaf", dueDate: "2026-12-01" });
    const parentId = await insertTask(project.id, { title: "Overdue parent", dueDate: "2026-10-01" });
    await insertTask(project.id, { title: "Overdue child", dueDate: "2026-10-02", parentId });

    // One open decision (an ask) and one resolved (counted nowhere).
    await insertDecision(project.id, { title: "Open ask", deadline: "2026-11-12" });
    await insertDecision(project.id, { title: "Resolved ask", status: "resolved" });

    // Stated status: an at-risk check-in, then a later plain note that must
    // not displace it.
    await insertStatusUpdate(project.id, { health: "at_risk", createdAt: "2026-10-10T09:00:00Z" });
    await insertStatusUpdate(project.id, { health: null, createdAt: "2026-10-12T09:00:00Z" });

    await insertActivity(project.id, "2026-10-20T10:00:00Z");

    // A critical open issue makes the computed health off track, the same
    // verdict the portfolio gives.
    await insertIssue(project.id, { severity: "critical", status: "open" });

    const data = await jsonBody<any>(await get(user));
    expect(data.projects).toHaveLength(1);
    const p = data.projects[0];
    expect(p.id).toBe(project.id);
    expect(p.name).toBe("Sync Project");
    expect(p.overdueTasks).toBe(2);
    expect(p.openDecisions).toBe(1);
    expect(p.health).toBe("off_track");
    expect(p.statedHealth).toBe("at_risk");
    expect(new Date(p.statedAt).toISOString()).toBe("2026-10-10T09:00:00.000Z");
    expect(new Date(p.lastActivityAt).toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(data.asks.map((a: any) => a.title)).toEqual(["Open ask"]);
  });

  it("includes projects the user is an active member of, and nothing for a stranger", async () => {
    const owner = await createTestUser("ws-member-owner@example.com");
    const member = await createTestUser("ws-member@example.com");
    const stranger = await createTestUser("ws-stranger@example.com");
    const project = await createTestProject(owner.id, "Shared");
    await insertDecision(project.id, { title: "Shared ask", deadline: "2026-11-15" });

    // Before membership is granted the member sees nothing either.
    let data = await jsonBody<any>(await get(member));
    expect(data.projects).toEqual([]);
    expect(data.asks).toEqual([]);

    const database = db();
    await database.sql`
      INSERT INTO project_members (project_id, user_id, invited_email, status)
      VALUES (${project.id}, ${member.id}, ${member.email}, 'active')
    `;
    data = await jsonBody<any>(await get(member));
    expect(data.projects.map((p: any) => p.name)).toEqual(["Shared"]);
    expect(data.asks.map((a: any) => a.title)).toEqual(["Shared ask"]);

    data = await jsonBody<any>(await get(stranger));
    expect(data.projects).toEqual([]);
    expect(data.asks).toEqual([]);
  });

  it("excludes archived and closed projects from both lists", async () => {
    const user = await createTestUser("ws-hidden@example.com");
    const archived = await createTestProject(user.id, "Archived");
    const closed = await createTestProject(user.id, "Closed");
    const live = await createTestProject(user.id, "Live");
    await insertDecision(archived.id, { title: "Archived ask" });
    await insertDecision(closed.id, { title: "Closed ask" });
    await insertDecision(live.id, { title: "Live ask" });
    const database = db();
    await database.sql`UPDATE projects SET archived = true WHERE id = ${archived.id}`;
    await database.sql`UPDATE projects SET closed_at = now() WHERE id = ${closed.id}`;

    const data = await jsonBody<any>(await get(user));
    expect(data.projects.map((p: any) => p.name)).toEqual(["Live"]);
    expect(data.asks.map((a: any) => a.title)).toEqual(["Live ask"]);
  });

  it("sorts asks by deadline (soonest first, undated last), then by age, and serializes deadlines as YYYY-MM-DD", async () => {
    const user = await createTestUser("ws-sort@example.com");
    const project = await createTestProject(user.id, "Sorting");
    await insertDecision(project.id, { title: "Later deadline", deadline: "2026-11-20", createdAt: "2026-10-01T09:00:00Z" });
    await insertDecision(project.id, { title: "Sooner deadline", deadline: "2026-11-05", createdAt: "2026-10-03T09:00:00Z" });
    await insertDecision(project.id, { title: "Undated older", deadline: null, createdAt: "2026-10-02T09:00:00Z" });
    await insertDecision(project.id, { title: "Undated newer", deadline: null, createdAt: "2026-10-04T09:00:00Z" });
    await insertDecision(project.id, { title: "Resolved early", status: "resolved", deadline: "2026-11-01", createdAt: "2026-09-01T09:00:00Z" });

    const data = await jsonBody<any>(await get(user));
    expect(data.asks.map((a: any) => a.title)).toEqual([
      "Sooner deadline",
      "Later deadline",
      "Undated older",
      "Undated newer",
    ]);
    expect(data.asks[0].deadline).toBe("2026-11-05");
    expect(typeof data.asks[0].deadline).toBe("string");
    expect(data.asks[2].deadline).toBeNull();
    expect(data.asks[2].projectId).toBe(project.id);
    expect(data.asks[2].projectName).toBe("Sorting");
  });

  it("returns recipient stakeholder names on asks, and an empty array when none were recorded", async () => {
    const user = await createTestUser("ws-recipients@example.com");
    const project = await createTestProject(user.id, "Recipients");
    const withNames = await insertDecision(project.id, { title: "Has recipients", context: "We need a call on the vendor.", deadline: "2026-11-12" });
    const zoe = await insertStakeholder(project.id, "Zoe Sponsor");
    const amy = await insertStakeholder(project.id, "Amy Approver");
    await addRecipient(withNames, zoe);
    await addRecipient(withNames, amy);
    await insertDecision(project.id, { title: "No recipients", deadline: "2026-11-13" });

    const data = await jsonBody<any>(await get(user));
    const named = data.asks.find((a: any) => a.title === "Has recipients");
    expect(named.recipients).toEqual(["Amy Approver", "Zoe Sponsor"]);
    expect(named.context).toBe("We need a call on the vendor.");
    const unnamed = data.asks.find((a: any) => a.title === "No recipients");
    expect(unnamed.recipients).toEqual([]);
    expect(unnamed.context).toBeNull();
  });
});
