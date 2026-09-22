import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import tasksHandler from "../tasks.mts";

// Tasks never had a notes/description field until the detail-view drawer
// work (v66) -- this covers just that addition; broader task CRUD behavior
// (hierarchy, status, cycle guards) already has coverage elsewhere.
describe("tasks description field", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a task with a description", async () => {
    const owner = await createTestUser("t-create@example.com");
    const project = await createTestProject(owner.id);
    const res = await tasksHandler(
      asUser(owner, {
        method: "POST", url: "https://tasketra.com/api/tasks",
        body: { projectId: project.id, title: "Ship the thing", description: "Needs a final review pass first." },
      })
    );
    expect(res.status).toBe(201);
    const body = await jsonBody<{ task: any }>(res);
    expect(body.task.description).toBe("Needs a final review pass first.");
  });

  it("defaults description to null when omitted", async () => {
    const owner = await createTestUser("t-nodesc@example.com");
    const project = await createTestProject(owner.id);
    const res = await tasksHandler(
      asUser(owner, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId: project.id, title: "Bare task" } })
    );
    const body = await jsonBody<{ task: any }>(res);
    expect(body.task.description).toBeNull();
  });

  it("updates a task's description without clobbering other fields", async () => {
    const owner = await createTestUser("t-update@example.com");
    const project = await createTestProject(owner.id);
    const create = await tasksHandler(
      asUser(owner, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId: project.id, title: "Task A", ownerName: "Dana" } })
    );
    const { task } = await jsonBody<{ task: any }>(create);

    const res = await tasksHandler(
      asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/tasks", body: { id: task.id, description: "Some context." } })
    );
    const body = await jsonBody<{ task: any }>(res);
    expect(body.task.description).toBe("Some context.");
    expect(body.task.title).toBe("Task A");
    expect(body.task.owner_name).toBe("Dana");
  });

  it("returns the description on GET list", async () => {
    const owner = await createTestUser("t-list@example.com");
    const project = await createTestProject(owner.id);
    await tasksHandler(
      asUser(owner, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId: project.id, title: "Task A", description: "Notes here" } })
    );
    const res = await tasksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/tasks?projectId=${project.id}` }));
    const body = await jsonBody<{ tasks: any[] }>(res);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].description).toBe("Notes here");
  });
});
