import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import searchHandler from "../search.mts";

// v159 (F-18): global search matches projects, tasks, decisions and risks
// by name/title across every project the user can see, and nothing outside
// that access rule. Direct inserts seed the entities; their own handlers
// have their own tests.

let tokenSeq = 0;
async function insertTask(projectId: string, title: string, deleted = false) {
  const database = db();
  await database.sql`
    INSERT INTO tasks (project_id, title, status, deleted_at)
    VALUES (${projectId}, ${title}, 'not_started', ${deleted ? new Date().toISOString() : null})
  `;
}
async function insertDecision(projectId: string, title: string) {
  const database = db();
  tokenSeq += 1;
  await database.sql`
    INSERT INTO decision_requests (project_id, title, context, options, deadline, public_token, status)
    VALUES (${projectId}, ${title}, NULL, ${JSON.stringify(["A", "B"])}, NULL, ${`tok-search-${tokenSeq}`}, 'open')
  `;
}
async function insertRisk(projectId: string, title: string) {
  const database = db();
  await database.sql`
    INSERT INTO risks (project_id, title, probability, impact, status)
    VALUES (${projectId}, ${title}, 'high', 'medium', 'open')
  `;
}

type SearchBody = {
  projects: { id: string; name: string }[];
  tasks: { id: string; title: string; projectId: string; projectName: string }[];
  decisions: { id: string; title: string; projectId: string; projectName: string }[];
  risks: { id: string; title: string; projectId: string; projectName: string }[];
};

async function search(user: { cookie: string }, q: string): Promise<SearchBody> {
  const res = await searchHandler(asUser(user, { method: "GET", url: `http://x/api/search?q=${encodeURIComponent(q)}` }));
  expect(res.status).toBe(200);
  return jsonBody<SearchBody>(res);
}

describe("search", () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);
  beforeEach(resetTestDb);

  it("requires authentication", async () => {
    const res = await searchHandler(new Request("http://x/api/search?q=portal"));
    expect(res.status).toBe(401);
  });

  it("returns empty groups for a query shorter than two characters", async () => {
    const user = await createTestUser("search-short@example.com");
    await createTestProject(user.id, "Portal Launch");
    expect(await search(user, "p")).toEqual({ projects: [], tasks: [], decisions: [], risks: [] });
    expect(await search(user, "")).toEqual({ projects: [], tasks: [], decisions: [], risks: [] });
  });

  it("matches all four types case-insensitively, with the project name attached", async () => {
    const user = await createTestUser("search-all@example.com");
    const project = await createTestProject(user.id, "Portal Launch");
    await insertTask(project.id, "Portal SSO wiring");
    await insertDecision(project.id, "Portal go/no-go");
    await insertRisk(project.id, "Portal adoption stalls");
    await insertTask(project.id, "Unrelated chore");

    const body = await search(user, "portal");
    expect(body.projects.map((p) => p.name)).toEqual(["Portal Launch"]);
    expect(body.tasks.map((t) => t.title)).toEqual(["Portal SSO wiring"]);
    expect(body.tasks[0]).toMatchObject({ projectId: project.id, projectName: "Portal Launch" });
    expect(body.decisions.map((d) => d.title)).toEqual(["Portal go/no-go"]);
    expect(body.risks.map((r) => r.title)).toEqual(["Portal adoption stalls"]);
  });

  it("never returns another user's projects or their contents", async () => {
    const owner = await createTestUser("search-owner@example.com");
    const stranger = await createTestUser("search-stranger@example.com");
    const project = await createTestProject(owner.id, "Secret Portal");
    await insertTask(project.id, "Secret portal task");

    const body = await search(stranger, "secret portal");
    expect(body).toEqual({ projects: [], tasks: [], decisions: [], risks: [] });
  });

  it("skips soft-deleted tasks", async () => {
    const user = await createTestUser("search-deleted@example.com");
    const project = await createTestProject(user.id, "Cleanup Project");
    await insertTask(project.id, "Portal live task");
    await insertTask(project.id, "Portal deleted task", true);

    const body = await search(user, "portal");
    expect(body.tasks.map((t) => t.title)).toEqual(["Portal live task"]);
  });
});
