import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import projectHandler from "../project.mts";
import stageHandler from "../stage.mts";

const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const getProject = async (user: { cookie: string }, id: string) =>
  (await jsonBody<{ project: any }>(await projectHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/project?id=${id}` })))).project;

describe("project charter", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts empty", async () => {
    const owner = await createTestUser("charter-empty@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await getProject(owner, project.id)).charter).toEqual({});
  });

  it("saves a cleaned charter and replaces it wholesale", async () => {
    const owner = await createTestUser("charter-save@example.com");
    const project = await createTestProject(owner.id, "P");
    const res = await patch(owner, { id: project.id, charter: { purpose: "  Open a clinic ", sponsor: "Dana", junk: "x" } });
    expect(res.status).toBe(200);
    expect((await getProject(owner, project.id)).charter).toEqual({ purpose: "Open a clinic", sponsor: "Dana" });
    await patch(owner, { id: project.id, charter: { scope_in: "Build-out" } });
    expect((await getProject(owner, project.id)).charter).toEqual({ scope_in: "Build-out" });
  });

  it("rejects a charter that is not an object", async () => {
    const owner = await createTestUser("charter-bad@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await patch(owner, { id: project.id, charter: "hello" })).status).toBe(400);
    expect((await patch(owner, { id: project.id, charter: null })).status).toBe(400);
  });

  it("does not let a stranger edit it", async () => {
    const owner = await createTestUser("charter-owner@example.com");
    const stranger = await createTestUser("charter-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await patch(stranger, { id: project.id, charter: { purpose: "x" } })).status).toBe(404);
  });

  it("logs the change", async () => {
    const owner = await createTestUser("charter-log@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, charter: { purpose: "x" } });
    const rows = await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id} AND summary = 'charter updated'`;
    expect(rows.length).toBe(1);
  });

  it("marks the Initiate charter row done once a purpose is saved", async () => {
    const owner = await createTestUser("charter-stage@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, stage: "initiate" });
    const read = async () => (await jsonBody<any>(await stageHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${project.id}` })))).checklist.items[0];
    expect((await read()).status).toBe("todo");
    await patch(owner, { id: project.id, charter: { purpose: "Why" } });
    expect((await read()).status).toBe("done");
  });
});
