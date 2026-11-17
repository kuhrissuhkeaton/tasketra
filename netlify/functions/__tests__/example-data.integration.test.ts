import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import projectsHandler from "../projects.mts";
import handler from "../example-data.mts";

const URL = "https://app.tasketra.com/api/example-data";
// 7 tasks + 3 roadmap items + 1 issue + 1 risk + 1 assumption
// + 1 dependency + 1 stakeholder = the full seed (exampleData.ts).
const SEED_TOTAL = 15;

async function createSeededProject(owner: { id: string; cookie: string }) {
  const res = await projectsHandler(
    asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/projects",
      body: { name: "Seeded", seedExample: true },
    })
  );
  expect(res.status).toBe(201);
  const body = await jsonBody<{ project: { id: string } }>(res);
  return body.project.id;
}

describe("example-data -- clear example data (v161)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await handler(new Request(`${URL}?projectId=whatever`, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("reports the full seed on a freshly seeded project", async () => {
    const owner = await createTestUser("ex-owner@example.com");
    const projectId = await createSeededProject(owner);

    const res = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${projectId}` }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ hasExampleData: boolean; counts: Record<string, number> }>(res);
    expect(body.hasExampleData).toBe(true);
    expect(body.counts).toMatchObject({ tasks: 7, roadmapItems: 3, issues: 1, risks: 1, assumptions: 1, dependencies: 1, stakeholders: 1, total: SEED_TOTAL });
  });

  it("reports nothing on a project that never had example data", async () => {
    const owner = await createTestUser("ex-plain@example.com");
    const project = await createTestProject(owner.id);

    const res = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ hasExampleData: boolean; counts: { total: number } }>(res);
    expect(body.hasExampleData).toBe(false);
    expect(body.counts.total).toBe(0);
  });

  it("hides the project from users without access", async () => {
    const owner = await createTestUser("ex-hidden-owner@example.com");
    const stranger = await createTestUser("ex-stranger@example.com");
    const projectId = await createSeededProject(owner);

    const res = await handler(asUser(stranger, { method: "GET", url: `${URL}?projectId=${projectId}` }));
    expect(res.status).toBe(404);
  });

  it("only the owner can clear", async () => {
    const owner = await createTestUser("ex-guard-owner@example.com");
    const stranger = await createTestUser("ex-guard-stranger@example.com");
    const projectId = await createSeededProject(owner);

    const res = await handler(asUser(stranger, { method: "POST", url: URL, body: { projectId } }));
    expect(res.status).toBe(403);

    const status = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${projectId}` }));
    const body = await jsonBody<{ counts: { total: number } }>(status);
    expect(body.counts.total).toBe(SEED_TOTAL);
  });

  it("clears the seed as soft deletes and leaves the project otherwise intact", async () => {
    const owner = await createTestUser("ex-clear@example.com");
    const projectId = await createSeededProject(owner);
    const database = db();

    // A task of the user's own, added after seeding, must survive.
    await database.sql`
      INSERT INTO tasks (project_id, title, status) VALUES (${projectId}, 'My own task', 'not_started')
    `;

    const res = await handler(asUser(owner, { method: "POST", url: URL, body: { projectId } }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ cleared: { total: number; tasks: number } }>(res);
    expect(body.cleared.total).toBe(SEED_TOTAL);
    expect(body.cleared.tasks).toBe(7);

    const [live] = await database.sql<{ n: number }>`
      SELECT count(*)::int AS n FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;
    expect(live.n).toBe(1); // only "My own task"
    const [trashed] = await database.sql<{ n: number }>`
      SELECT count(*)::int AS n FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    `;
    expect(trashed.n).toBe(7);
    const [stakeholder] = await database.sql<{ n: number }>`
      SELECT count(*)::int AS n FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;
    expect(stakeholder.n).toBe(0);

    // And the status endpoint now reports a clean project.
    const after = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${projectId}` }));
    const afterBody = await jsonBody<{ hasExampleData: boolean }>(after);
    expect(afterBody.hasExampleData).toBe(false);
  });

  it("a renamed example item is the user's now and survives the clear", async () => {
    const owner = await createTestUser("ex-rename@example.com");
    const projectId = await createSeededProject(owner);
    const database = db();
    await database.sql`
      UPDATE tasks SET title = 'Build the actual wireframes' WHERE project_id = ${projectId} AND title = 'Build wireframes'
    `;

    const res = await handler(asUser(owner, { method: "POST", url: URL, body: { projectId } }));
    const body = await jsonBody<{ cleared: { total: number; tasks: number } }>(res);
    expect(body.cleared.tasks).toBe(6);
    expect(body.cleared.total).toBe(SEED_TOTAL - 1);

    const [live] = await database.sql<{ n: number }>`
      SELECT count(*)::int AS n FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `;
    expect(live.n).toBe(1);
  });

  it("matches only inside the creation window", async () => {
    const owner = await createTestUser("ex-window@example.com");
    const project = await createTestProject(owner.id);
    const database = db();
    const [row] = await database.sql<{ created_at: string }>`
      SELECT created_at FROM projects WHERE id = ${project.id}
    `;
    const created = new Date(row.created_at).getTime();
    const at = (ms: number) => new Date(created + ms).toISOString();

    // A look-alike title created long after the project: not example data.
    await database.sql`
      INSERT INTO tasks (project_id, title, status, created_at)
      VALUES (${project.id}, 'Build wireframes', 'not_started', ${at(2 * 60 * 60 * 1000)})
    `;
    let res = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    let body = await jsonBody<{ hasExampleData: boolean; counts: { total: number } }>(res);
    expect(body.hasExampleData).toBe(false);

    // The same title inside the seeding window counts (the documented
    // false-positive surface of title+window matching).
    await database.sql`
      INSERT INTO tasks (project_id, title, status, created_at)
      VALUES (${project.id}, 'Draft project charter', 'not_started', ${at(5 * 60 * 1000)})
    `;
    res = await handler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    body = await jsonBody<{ hasExampleData: boolean; counts: { total: number } }>(res);
    expect(body.hasExampleData).toBe(true);
    expect(body.counts.total).toBe(1);
  });
});
