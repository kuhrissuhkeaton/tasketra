import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import taskDependenciesHandler from "../task-dependencies.mts";
import tasksHandler from "../tasks.mts";

async function makeTask(owner: any, projectId: string, title = "A task") {
  const res = await tasksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId, title } }));
  const { task } = await jsonBody<{ task: any }>(res);
  return task;
}

const URL = "https://tasketra.com/api/task-dependencies";

describe("task-dependencies", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/task-dependencies", () => {
    it("links a task to the task it depends on", async () => {
      const owner = await createTestUser("td-link@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id, "Write the report");
      const dependsOn = await makeTask(owner, project.id, "Collect the data");

      const res = await taskDependenciesHandler(
        asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } })
      );
      expect(res.status).toBe(201);
      const { link } = await jsonBody<{ link: any }>(res);
      expect(link.task_id).toBe(task.id);
      expect(link.depends_on_task_id).toBe(dependsOn.id);
      expect(link.task_title).toBe("Write the report");
      expect(link.depends_on_title).toBe("Collect the data");
    });

    it("is idempotent -- linking the same pair twice returns the existing link instead of erroring", async () => {
      const owner = await createTestUser("td-dup@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);

      const first = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));
      const { link: firstLink } = await jsonBody<{ link: any }>(first);

      const second = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));
      expect(second.status).toBe(200);
      const { link: secondLink } = await jsonBody<{ link: any }>(second);
      expect(secondLink.id).toBe(firstLink.id);

      const list = await taskDependenciesHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
      const { links } = await jsonBody<{ links: any[] }>(list);
      expect(links).toHaveLength(1);
    });

    it("rejects a task depending on itself", async () => {
      const owner = await createTestUser("td-self@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);

      const res = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: task.id } }));
      expect(res.status).toBe(400);
    });

    it("rejects a task from a different project", async () => {
      const owner = await createTestUser("td-crossproj@example.com");
      const projectA = await createTestProject(owner.id, "Project A");
      const projectB = await createTestProject(owner.id, "Project B");
      const taskInA = await makeTask(owner, projectA.id);
      const taskInB = await makeTask(owner, projectB.id);

      const res = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: projectA.id, taskId: taskInA.id, dependsOnTaskId: taskInB.id } }));
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating a link", async () => {
      const owner = await createTestUser("td-owner@example.com");
      const stranger = await createTestUser("td-stranger@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);

      const res = await taskDependenciesHandler(asUser(stranger, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/task-dependencies", () => {
    it("lists links for a project with titles joined in", async () => {
      const owner = await createTestUser("td-list@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id, "Deploy");
      const dependsOn = await makeTask(owner, project.id, "Run migrations");
      await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));

      const res = await taskDependenciesHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
      const { links } = await jsonBody<{ links: any[] }>(res);
      expect(links).toHaveLength(1);
      expect(links[0].task_title).toBe("Deploy");
      expect(links[0].depends_on_title).toBe("Run migrations");
    });

    it("omits a link whose task was soft-deleted", async () => {
      const owner = await createTestUser("td-taskdel@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);
      await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));

      await tasksHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/tasks?id=${dependsOn.id}` }));

      const res = await taskDependenciesHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
      const { links } = await jsonBody<{ links: any[] }>(res);
      expect(links).toHaveLength(0);
    });
  });

  describe("DELETE /api/task-dependencies", () => {
    it("removes a link", async () => {
      const owner = await createTestUser("td-del@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);
      const create = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));
      const { link } = await jsonBody<{ link: any }>(create);

      const res = await taskDependenciesHandler(asUser(owner, { method: "DELETE", url: `${URL}?id=${link.id}` }));
      expect(res.status).toBe(200);

      const list = await taskDependenciesHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
      const { links } = await jsonBody<{ links: any[] }>(list);
      expect(links).toHaveLength(0);
    });

    it("blocks a stranger from deleting a link", async () => {
      const owner = await createTestUser("td-delowner@example.com");
      const stranger = await createTestUser("td-delstranger@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);
      const create = await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));
      const { link } = await jsonBody<{ link: any }>(create);

      const res = await taskDependenciesHandler(asUser(stranger, { method: "DELETE", url: `${URL}?id=${link.id}` }));
      expect(res.status).toBe(404);
    });
  });

  describe("cascade behavior", () => {
    it("deleting a task hard-removes its links (ON DELETE CASCADE)", async () => {
      const owner = await createTestUser("td-hardcascade@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const dependsOn = await makeTask(owner, project.id);
      await taskDependenciesHandler(asUser(owner, { method: "POST", url: URL, body: { projectId: project.id, taskId: task.id, dependsOnTaskId: dependsOn.id } }));

      const { db } = await import("../../lib/db.ts");
      const database = db();
      await database.sql`DELETE FROM tasks WHERE id = ${task.id}`;
      const remaining = await database.sql`SELECT * FROM task_task_links WHERE task_id = ${task.id}`;
      expect(remaining).toHaveLength(0);
    });
  });
});
