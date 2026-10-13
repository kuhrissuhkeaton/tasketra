import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import tasksHandler from "../tasks.mts";

// Task priority is optional: null by default, low/medium/high when set, and
// only ever changed when the caller sends the key.
describe("task priority", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  async function create(user: any, projectId: string, extra: Record<string, unknown> = {}) {
    const res = await tasksHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId, title: "A task", ...extra } }));
    return { res, body: await jsonBody<{ task: any; error?: string }>(res) };
  }
  async function patch(user: any, body: Record<string, unknown>) {
    const res = await tasksHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/tasks", body }));
    return { res, body: await jsonBody<{ task: any; error?: string }>(res) };
  }

  it("defaults to no priority and returns the field on list", async () => {
    const owner = await createTestUser("p-default@example.com");
    const project = await createTestProject(owner.id);
    const { res, body } = await create(owner, project.id);
    expect(res.status).toBe(201);
    expect(body.task.priority).toBeNull();
    const list = await tasksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/tasks?projectId=${project.id}` }));
    const { tasks } = await jsonBody<{ tasks: any[] }>(list);
    expect(tasks[0].priority).toBeNull();
  });

  it("creates a task with a priority and rejects an invalid one", async () => {
    const owner = await createTestUser("p-create@example.com");
    const project = await createTestProject(owner.id);
    const ok = await create(owner, project.id, { priority: "high" });
    expect(ok.body.task.priority).toBe("high");
    const bad = await create(owner, project.id, { priority: "urgent" });
    expect(bad.res.status).toBe(400);
  });

  it("sets, changes and clears priority, and leaves it alone when the key is not sent", async () => {
    const owner = await createTestUser("p-patch@example.com");
    const project = await createTestProject(owner.id);
    const { body: created } = await create(owner, project.id);
    const id = created.task.id;

    expect((await patch(owner, { id, priority: "medium" })).body.task.priority).toBe("medium");
    expect((await patch(owner, { id, title: "Renamed" })).body.task.priority).toBe("medium");
    expect((await patch(owner, { id, priority: "low" })).body.task.priority).toBe("low");
    expect((await patch(owner, { id, priority: null })).body.task.priority).toBeNull();
    const bad = await patch(owner, { id, priority: "urgent" });
    expect(bad.res.status).toBe(400);
  });

  it("blocks a stranger from setting priority", async () => {
    const owner = await createTestUser("p-owner@example.com");
    const stranger = await createTestUser("p-stranger@example.com");
    const project = await createTestProject(owner.id);
    const { body: created } = await create(owner, project.id);
    const res = await patch(stranger, { id: created.task.id, priority: "high" });
    expect(res.res.status).toBe(404);
  });
});
