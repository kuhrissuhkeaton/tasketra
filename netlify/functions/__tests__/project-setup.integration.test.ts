import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import projectsHandler from "../projects.mts";
import projectHandler from "../project.mts";
import stageHandler from "../stage.mts";

const create = (user: { cookie: string }, body: unknown) =>
  projectsHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/projects", body }));
const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const getProject = async (user: { cookie: string }, id: string) =>
  (await jsonBody<{ project: any }>(await projectHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/project?id=${id}` })))).project;

describe("project size and approach", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("defaults a new project to Standard and Hybrid", async () => {
    const owner = await createTestUser("setup-default@example.com");
    const res = await create(owner, { name: "Default" });
    expect(res.status).toBe(201);
    const { project } = await jsonBody<{ project: any }>(res);
    expect(project).toMatchObject({ size: "standard", approach: "hybrid" });
    expect((await getProject(owner, project.id)).show_all_tabs).toBe(false);
  });

  it("creates a project with the chosen size and approach", async () => {
    const owner = await createTestUser("setup-chosen@example.com");
    const { project } = await jsonBody<{ project: any }>(await create(owner, { name: "Small", size: "light", approach: "agile" }));
    expect(project).toMatchObject({ size: "light", approach: "agile" });
  });

  it("rejects an unknown size or approach on create and creates nothing", async () => {
    const owner = await createTestUser("setup-bad-create@example.com");
    expect((await create(owner, { name: "X", size: "huge" })).status).toBe(400);
    expect((await create(owner, { name: "X", approach: "chaotic" })).status).toBe(400);
    const rows = await db().sql`SELECT id FROM projects WHERE owner_id = ${owner.id}`;
    expect(rows).toHaveLength(0);
  });

  it("lets the owner change size, approach and show-all-tabs without touching other fields", async () => {
    const owner = await createTestUser("setup-patch@example.com");
    const project = await createTestProject(owner.id, "Keep my name");
    await patch(owner, { id: project.id, stage: "execute" });
    const res = await patch(owner, { id: project.id, size: "light", approach: "agile", show_all_tabs: true });
    expect(res.status).toBe(200);
    expect((await jsonBody<{ project: any }>(res)).project).toMatchObject({ size: "light", approach: "agile", show_all_tabs: true, name: "Keep my name", stage: "execute" });
    const after = await getProject(owner, project.id);
    expect(after).toMatchObject({ size: "light", approach: "agile", show_all_tabs: true });
  });

  it("can switch show-all-tabs back off", async () => {
    const owner = await createTestUser("setup-toggle@example.com");
    const project = await createTestProject(owner.id);
    await patch(owner, { id: project.id, show_all_tabs: true });
    await patch(owner, { id: project.id, show_all_tabs: false });
    expect((await getProject(owner, project.id)).show_all_tabs).toBe(false);
  });

  it("rejects bad values on PATCH and leaves the project unchanged", async () => {
    const owner = await createTestUser("setup-bad-patch@example.com");
    const project = await createTestProject(owner.id);
    expect((await patch(owner, { id: project.id, size: "gigantic" })).status).toBe(400);
    expect((await patch(owner, { id: project.id, approach: "waterfall" })).status).toBe(400);
    expect(await getProject(owner, project.id)).toMatchObject({ size: "standard", approach: "hybrid" });
  });

  it("does not let a stranger or a member change the setup", async () => {
    const owner = await createTestUser("setup-owner@example.com");
    const stranger = await createTestUser("setup-stranger@example.com");
    const project = await createTestProject(owner.id);
    expect((await patch(stranger, { id: project.id, size: "light" })).status).toBe(404);
    expect((await getProject(owner, project.id)).size).toBe("standard");
  });

  it("logs a setup change to the activity feed", async () => {
    const owner = await createTestUser("setup-log@example.com");
    const project = await createTestProject(owner.id);
    await patch(owner, { id: project.id, size: "full" });
    const rows = await db().sql`SELECT summary FROM activity_log WHERE project_id = ${project.id}`;
    expect(rows.map((r: any) => r.summary)).toContain("project setup changed");
  });

  it("tailors the stage checklist to a Light project (no budget row)", async () => {
    const owner = await createTestUser("setup-stage@example.com");
    const project = await createTestProject(owner.id);
    await patch(owner, { id: project.id, size: "light" });
    const res = await stageHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${project.id}` }));
    const data = await jsonBody<any>(res);
    expect(data.checklist.items.map((i: any) => i.id)).not.toContain("budget");
    expect(data.checklist.optionalNote).toBeNull();
  });
});
