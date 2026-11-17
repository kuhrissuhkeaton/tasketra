import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import roadmapHandler from "../roadmap.mts";
import tasksHandler from "../tasks.mts";
import feedHandler from "../feed.mts";

// v163 (Phase 6, Delight pack): the two feed eggs are ordinary
// activity_log rows written beside the event that earned them -- no
// migration, no table, no marker column. Egg 6 (On the nose): a
// milestone completed on its planned date (its start_date, in the
// completer's timezone; test users carry no timezone, so UTC). Egg 10
// (Century): the completion that brings a project's live done-task
// count to exactly 100. Both are asserted through the real Feed, the
// surface they live on.
describe("delight feed eggs", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const plusDays = (key: string, days: number) => {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  async function feedBodies(projectId: string, user: any): Promise<string[]> {
    const res = await feedHandler(asUser(user, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    return body.feed.filter((f: any) => f.type === "activity").map((f: any) => f.body as string);
  }

  async function addRoadmapItem(user: any, projectId: string, body: Record<string, unknown>) {
    const res = await roadmapHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/roadmap", body: { projectId, ...body } }));
    expect(res.status).toBe(201);
    return (await jsonBody<any>(res)).item;
  }

  async function completeRoadmapItem(user: any, id: string) {
    const res = await roadmapHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/roadmap", body: { id, status: "done" } }));
    expect(res.status).toBe(200);
  }

  describe("Egg 6: On the nose", () => {
    it("a milestone completed on its planned date earns exactly one marker in the Feed", async () => {
      const owner = await createTestUser("egg6@example.com");
      const project = await createTestProject(owner.id);
      const item = await addRoadmapItem(owner, project.id, { title: "Launch day", startDate: todayKey() });
      await completeRoadmapItem(owner, item.id);
      const bodies = await feedBodies(project.id, owner);
      expect(bodies.filter((b) => b === "On the nose.")).toHaveLength(1);
    });

    it("a milestone completed a day late earns no marker", async () => {
      const owner = await createTestUser("egg6-late@example.com");
      const project = await createTestProject(owner.id);
      const item = await addRoadmapItem(owner, project.id, { title: "Slipped", startDate: plusDays(todayKey(), -1) });
      await completeRoadmapItem(owner, item.id);
      const bodies = await feedBodies(project.id, owner);
      expect(bodies).not.toContain("On the nose.");
    });

    it("a phase completed on its start date earns no marker (milestones only)", async () => {
      const owner = await createTestUser("egg6-phase@example.com");
      const project = await createTestProject(owner.id);
      const item = await addRoadmapItem(owner, project.id, { title: "Build phase", type: "phase", startDate: todayKey(), endDate: plusDays(todayKey(), 14) });
      await completeRoadmapItem(owner, item.id);
      const bodies = await feedBodies(project.id, owner);
      expect(bodies).not.toContain("On the nose.");
    });

    it("a milestone with no planned date earns no marker", async () => {
      const owner = await createTestUser("egg6-nodate@example.com");
      const project = await createTestProject(owner.id);
      const item = await addRoadmapItem(owner, project.id, { title: "Undated" });
      await completeRoadmapItem(owner, item.id);
      const bodies = await feedBodies(project.id, owner);
      expect(bodies).not.toContain("On the nose.");
    });
  });

  describe("Egg 10: Century", () => {
    async function seedDoneTasks(projectId: string, count: number) {
      await db().sql`
        INSERT INTO tasks (project_id, title, status)
        SELECT ${projectId}, 'Seed task ' || g, 'done' FROM generate_series(1, ${count}) AS g
      `;
    }

    async function createAndCompleteTask(user: any, projectId: string, title: string) {
      const res = await tasksHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/tasks", body: { projectId, title } }));
      expect(res.status).toBe(201);
      const task = (await jsonBody<any>(res)).task;
      const patch = await tasksHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/tasks", body: { id: task.id, status: "done" } }));
      expect(patch.status).toBe(200);
    }

    it("the 100th completion writes the Century line to the Feed, once", async () => {
      const owner = await createTestUser("egg10@example.com");
      const project = await createTestProject(owner.id);
      await seedDoneTasks(project.id, 99);
      await createAndCompleteTask(owner, project.id, "The hundredth");
      const bodies = await feedBodies(project.id, owner);
      expect(bodies.filter((b) => b === "Century: 100 tasks done on this project.")).toHaveLength(1);
    });

    it("the 99th completion writes nothing", async () => {
      const owner = await createTestUser("egg10-early@example.com");
      const project = await createTestProject(owner.id);
      await seedDoneTasks(project.id, 98);
      await createAndCompleteTask(owner, project.id, "Only the 99th");
      const bodies = await feedBodies(project.id, owner);
      expect(bodies).not.toContain("Century: 100 tasks done on this project.");
    });
  });
});
