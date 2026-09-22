import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import raidTaskLinksHandler from "../raid-task-links.mts";
import tasksHandler from "../tasks.mts";
import risksHandler from "../risks.mts";
import issuesHandler from "../issues.mts";

async function makeTask(owner: any, projectId: string, title = "Blocked task") {
  const res = await tasksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId, title } }));
  const { task } = await jsonBody<{ task: any }>(res);
  return task;
}
async function makeRisk(owner: any, projectId: string, title = "A risk") {
  const res = await risksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/risks", body: { projectId, title } }));
  const { risk } = await jsonBody<{ risk: any }>(res);
  return risk;
}
async function makeIssue(owner: any, projectId: string, title = "An issue") {
  const res = await issuesHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/issues", body: { projectId, title } }));
  const { issue } = await jsonBody<{ issue: any }>(res);
  return issue;
}

describe("raid-task-links", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/raid-task-links", () => {
    it("links a risk to a task", async () => {
      const owner = await createTestUser("l-risk@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id, "Vendor delay");

      const res = await raidTaskLinksHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/raid-task-links",
          body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id },
        })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ link: any }>(res);
      expect(body.link.risk_id).toBe(risk.id);
      expect(body.link.task_id).toBe(task.id);
      expect(body.link.risk_title).toBe("Vendor delay");
    });

    it("links an issue to a task", async () => {
      const owner = await createTestUser("l-issue@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const issue = await makeIssue(owner, project.id, "API outage");

      const res = await raidTaskLinksHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/raid-task-links",
          body: { projectId: project.id, sourceType: "issue", sourceId: issue.id, taskId: task.id },
        })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ link: any }>(res);
      expect(body.link.issue_id).toBe(issue.id);
      expect(body.link.task_id).toBe(task.id);
    });

    it("is idempotent -- linking the same risk/task pair twice returns the existing link instead of erroring", async () => {
      const owner = await createTestUser("l-dup@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);

      const first = await raidTaskLinksHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } })
      );
      const { link: firstLink } = await jsonBody<{ link: any }>(first);

      const second = await raidTaskLinksHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } })
      );
      expect(second.status).toBe(200);
      const { link: secondLink } = await jsonBody<{ link: any }>(second);
      expect(secondLink.id).toBe(firstLink.id);

      const list = await raidTaskLinksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/raid-task-links?projectId=${project.id}` }));
      const { riskLinks } = await jsonBody<{ riskLinks: any[] }>(list);
      expect(riskLinks).toHaveLength(1);
    });

    it("rejects a task from a different project", async () => {
      const owner = await createTestUser("l-crossproj@example.com");
      const projectA = await createTestProject(owner.id, "Project A");
      const projectB = await createTestProject(owner.id, "Project B");
      const taskInB = await makeTask(owner, projectB.id);
      const riskInA = await makeRisk(owner, projectA.id);

      const res = await raidTaskLinksHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: projectA.id, sourceType: "risk", sourceId: riskInA.id, taskId: taskInB.id } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating a link", async () => {
      const owner = await createTestUser("l-owner@example.com");
      const stranger = await createTestUser("l-stranger@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);

      const res = await raidTaskLinksHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } })
      );
      expect(res.status).toBe(404);
    });

    it("rejects an invalid sourceType", async () => {
      const owner = await createTestUser("l-badtype@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const res = await raidTaskLinksHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "quality", sourceId: task.id, taskId: task.id } })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/raid-task-links", () => {
    it("lists both risk and issue links for a project, with titles joined in", async () => {
      const owner = await createTestUser("l-list@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id, "Migrate the database");
      const risk = await makeRisk(owner, project.id, "Downtime risk");
      const issue = await makeIssue(owner, project.id, "Schema drift");

      await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } }));
      await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "issue", sourceId: issue.id, taskId: task.id } }));

      const res = await raidTaskLinksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/raid-task-links?projectId=${project.id}` }));
      const body = await jsonBody<{ riskLinks: any[]; issueLinks: any[] }>(res);
      expect(body.riskLinks).toHaveLength(1);
      expect(body.riskLinks[0].task_title).toBe("Migrate the database");
      expect(body.riskLinks[0].risk_title).toBe("Downtime risk");
      expect(body.issueLinks).toHaveLength(1);
      expect(body.issueLinks[0].issue_title).toBe("Schema drift");
    });

    it("omits a link whose task was soft-deleted", async () => {
      const owner = await createTestUser("l-taskdel@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);
      await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } }));

      await tasksHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/tasks?id=${task.id}` }));

      const res = await raidTaskLinksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/raid-task-links?projectId=${project.id}` }));
      const body = await jsonBody<{ riskLinks: any[] }>(res);
      expect(body.riskLinks).toHaveLength(0);
    });
  });

  describe("DELETE /api/raid-task-links", () => {
    it("removes a risk-task link", async () => {
      const owner = await createTestUser("l-del@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);
      const create = await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } }));
      const { link } = await jsonBody<{ link: any }>(create);

      const res = await raidTaskLinksHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/raid-task-links?id=${link.id}&sourceType=risk` }));
      expect(res.status).toBe(200);

      const list = await raidTaskLinksHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/raid-task-links?projectId=${project.id}` }));
      const { riskLinks } = await jsonBody<{ riskLinks: any[] }>(list);
      expect(riskLinks).toHaveLength(0);
    });

    it("blocks a stranger from deleting a link", async () => {
      const owner = await createTestUser("l-delowner@example.com");
      const stranger = await createTestUser("l-delstranger@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);
      const create = await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } }));
      const { link } = await jsonBody<{ link: any }>(create);

      const res = await raidTaskLinksHandler(asUser(stranger, { method: "DELETE", url: `https://tasketra.com/api/raid-task-links?id=${link.id}&sourceType=risk` }));
      expect(res.status).toBe(404);
    });
  });

  describe("cascade behavior", () => {
    it("deleting a task hard-removes its links (ON DELETE CASCADE, not visible through the soft-delete filter alone)", async () => {
      // deleteTask soft-deletes (deleted_at), which the GET join above
      // already covers filtering out -- this test hard-deletes the row via
      // SQL to prove the FK's ON DELETE CASCADE itself is wired correctly,
      // independent of the application-level soft-delete filter.
      const owner = await createTestUser("l-hardcascade@example.com");
      const project = await createTestProject(owner.id);
      const task = await makeTask(owner, project.id);
      const risk = await makeRisk(owner, project.id);
      await raidTaskLinksHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/raid-task-links", body: { projectId: project.id, sourceType: "risk", sourceId: risk.id, taskId: task.id } }));

      const { db } = await import("../../lib/db.ts");
      const database = db();
      await database.sql`DELETE FROM tasks WHERE id = ${task.id}`;
      const remaining = await database.sql`SELECT * FROM risk_task_links WHERE task_id = ${task.id}`;
      expect(remaining).toHaveLength(0);
    });
  });
});
