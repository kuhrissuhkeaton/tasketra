import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import projectHandler from "../project.mts";
import stageHandler from "../stage.mts";
import portfolioHandler from "../portfolio.mts";

const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const getProject = async (user: { cookie: string }, id: string) =>
  (await jsonBody<{ project: any }>(await projectHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/project?id=${id}` })))).project;
const band = async (user: { cookie: string }, id: string) =>
  (await jsonBody<any>(await stageHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${id}` })))).band;
const portfolio = async (user: { cookie: string }) =>
  jsonBody<{ projects: { id: string; escalations: string[] }[] }>(await portfolioHandler(asUser(user, { method: "GET", url: "https://tasketra.com/api/portfolio" })));

describe("escalation thresholds", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts with none, saves cleaned values, and replaces them wholesale", async () => {
    const owner = await createTestUser("tol-save@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await getProject(owner, project.id)).tolerances).toEqual({});
    expect((await patch(owner, { id: project.id, tolerances: { cpi_min: "0.9", overdue_max: 3, junk: 1 } })).status).toBe(200);
    expect((await getProject(owner, project.id)).tolerances).toEqual({ cpi_min: 0.9, overdue_max: 3 });
    await patch(owner, { id: project.id, tolerances: { high_risks_max: 2 } });
    expect((await getProject(owner, project.id)).tolerances).toEqual({ high_risks_max: 2 });
    await patch(owner, { id: project.id, tolerances: {} });
    expect((await getProject(owner, project.id)).tolerances).toEqual({});
  });

  it("rejects non-objects, blocks strangers, and logs the change", async () => {
    const owner = await createTestUser("tol-owner@example.com");
    const stranger = await createTestUser("tol-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await patch(owner, { id: project.id, tolerances: "x" })).status).toBe(400);
    expect((await patch(stranger, { id: project.id, tolerances: { overdue_max: 1 } })).status).toBe(404);
    await patch(owner, { id: project.id, tolerances: { overdue_max: 1 } });
    const rows = await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id} AND summary = 'escalation thresholds updated'`;
    expect(rows).toHaveLength(1);
  });

  it("turns the Home band red and flags the portfolio when a limit is crossed", async () => {
    const owner = await createTestUser("tol-band@example.com");
    const project = await createTestProject(owner.id, "P");
    const database = db();
    await database.sql`INSERT INTO tasks (project_id, title, due_date) VALUES (${project.id}, 'a', '2020-01-01'), (${project.id}, 'b', '2020-01-02'), (${project.id}, 'c', '2020-01-03')`;
    await database.sql`INSERT INTO risks (project_id, title, probability, impact) VALUES (${project.id}, 'r', 'high', 'low')`;

    expect((await band(owner, project.id)).state).not.toBe("escalate");
    await patch(owner, { id: project.id, tolerances: { overdue_max: 2, high_risks_max: 1 } });
    const b = await band(owner, project.id);
    expect(b.state).toBe("escalate");
    expect(b.message).toBe("Needs escalation: 3 overdue tasks (limit 2)");

    const p = (await portfolio(owner)).projects.find((x) => x.id === project.id)!;
    expect(p.escalations).toEqual(["3 overdue tasks (limit 2)"]);

    await patch(owner, { id: project.id, tolerances: { overdue_max: 3 } });
    expect((await band(owner, project.id)).state).not.toBe("escalate");
    expect((await portfolio(owner)).projects.find((x) => x.id === project.id)!.escalations).toEqual([]);
  });
});
