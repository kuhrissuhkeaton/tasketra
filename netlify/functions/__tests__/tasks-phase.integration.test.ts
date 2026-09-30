import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import tasksHandler from "../tasks.mts";
import roadmapHandler from "../roadmap.mts";
import roadmapPublicHandler from "../roadmap-public.mts";
import projectHandler from "../project.mts";
import { db } from "../../lib/db.ts";

// v81: a task can optionally be tied to one roadmap phase, and each phase
// reports how many of its linked tasks are done.
const TASKS = "https://tasketra.com/api/tasks";
const ROADMAP = "https://tasketra.com/api/roadmap";

async function addItem(owner: any, projectId: string, type: string, title: string) {
  const res = await roadmapHandler(asUser(owner, { method: "POST", url: ROADMAP, body: { projectId, type, title } }));
  return (await jsonBody<{ item: any }>(res)).item;
}
async function addTask(owner: any, projectId: string, body: Record<string, unknown> = {}) {
  return tasksHandler(asUser(owner, { method: "POST", url: TASKS, body: { projectId, title: "A task", ...body } }));
}
async function listItems(owner: any, projectId: string) {
  const res = await roadmapHandler(asUser(owner, { method: "GET", url: `${ROADMAP}?projectId=${projectId}` }));
  return (await jsonBody<{ items: any[] }>(res)).items;
}

describe("tasks linked to a roadmap phase", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a task with a phase and returns the link on GET", async () => {
    const owner = await createTestUser("ph-create@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Design");
    const res = await addTask(owner, project.id, { phaseId: phase.id });
    expect(res.status).toBe(201);
    expect((await jsonBody<{ task: any }>(res)).task.roadmap_item_id).toBe(phase.id);

    const list = await tasksHandler(asUser(owner, { method: "GET", url: `${TASKS}?projectId=${project.id}` }));
    expect((await jsonBody<{ tasks: any[] }>(list)).tasks[0].roadmap_item_id).toBe(phase.id);
  });

  it("defaults to no phase when omitted", async () => {
    const owner = await createTestUser("ph-default@example.com");
    const project = await createTestProject(owner.id);
    const res = await addTask(owner, project.id);
    expect((await jsonBody<{ task: any }>(res)).task.roadmap_item_id).toBeNull();
  });

  it("rejects a phase from another project", async () => {
    const owner = await createTestUser("ph-cross@example.com");
    const projectA = await createTestProject(owner.id, "A");
    const projectB = await createTestProject(owner.id, "B");
    const phaseB = await addItem(owner, projectB.id, "phase", "B phase");
    const res = await addTask(owner, projectA.id, { phaseId: phaseB.id });
    expect(res.status).toBe(400);
  });

  it("rejects a roadmap item that is not a phase", async () => {
    const owner = await createTestUser("ph-notphase@example.com");
    const project = await createTestProject(owner.id);
    const milestone = await addItem(owner, project.id, "milestone", "Launch");
    const res = await addTask(owner, project.id, { phaseId: milestone.id });
    expect(res.status).toBe(400);
  });

  it("rejects a phase that has been deleted", async () => {
    const owner = await createTestUser("ph-deleted@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Gone");
    await roadmapHandler(asUser(owner, { method: "DELETE", url: `${ROADMAP}?id=${phase.id}` }));
    const res = await addTask(owner, project.id, { phaseId: phase.id });
    expect(res.status).toBe(400);
  });

  it("links, changes and clears the phase via PATCH without clobbering other fields", async () => {
    const owner = await createTestUser("ph-patch@example.com");
    const project = await createTestProject(owner.id);
    const p1 = await addItem(owner, project.id, "phase", "Plan");
    const p2 = await addItem(owner, project.id, "phase", "Build");
    const created = await addTask(owner, project.id, { ownerName: "Dana" });
    const { task } = await jsonBody<{ task: any }>(created);

    const patch = async (body: Record<string, unknown>) =>
      (await jsonBody<{ task: any }>(await tasksHandler(asUser(owner, { method: "PATCH", url: TASKS, body: { id: task.id, ...body } })))).task;

    expect((await patch({ phaseId: p1.id })).roadmap_item_id).toBe(p1.id);
    expect((await patch({ phaseId: p2.id })).roadmap_item_id).toBe(p2.id);
    // Leaving phaseId out keeps the link.
    const untouched = await patch({ status: "in_progress" });
    expect(untouched.roadmap_item_id).toBe(p2.id);
    expect(untouched.owner_name).toBe("Dana");
    // An explicit null clears it.
    expect((await patch({ phaseId: null })).roadmap_item_id).toBeNull();
  });

  it("rejects linking an existing task to a phase from another project", async () => {
    const owner = await createTestUser("ph-patch-cross@example.com");
    const projectA = await createTestProject(owner.id, "A");
    const projectB = await createTestProject(owner.id, "B");
    const phaseB = await addItem(owner, projectB.id, "phase", "B phase");
    const { task } = await jsonBody<{ task: any }>(await addTask(owner, projectA.id));
    const res = await tasksHandler(asUser(owner, { method: "PATCH", url: TASKS, body: { id: task.id, phaseId: phaseB.id } }));
    expect(res.status).toBe(400);
  });

  it("reports task_total and task_done per phase, ignoring deleted tasks", async () => {
    const owner = await createTestUser("ph-counts@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Execute");
    const empty = await addItem(owner, project.id, "phase", "Close");
    await addTask(owner, project.id, { phaseId: phase.id, status: "done" });
    await addTask(owner, project.id, { phaseId: phase.id, status: "done" });
    await addTask(owner, project.id, { phaseId: phase.id, status: "in_progress" });
    const doomed = await jsonBody<{ task: any }>(await addTask(owner, project.id, { phaseId: phase.id, status: "done" }));
    await addTask(owner, project.id, { status: "done" }); // unlinked, must not count
    await tasksHandler(asUser(owner, { method: "DELETE", url: `${TASKS}?id=${doomed.task.id}` }));

    const items = await listItems(owner, project.id);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId[phase.id].task_total).toBe(3);
    expect(byId[phase.id].task_done).toBe(2);
    expect(byId[empty.id].task_total).toBe(0);
    expect(byId[empty.id].task_done).toBe(0);
  });

  it("keeps task links when a phase goes to Trash and is restored", async () => {
    const owner = await createTestUser("ph-restore@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Design");
    await addTask(owner, project.id, { phaseId: phase.id, status: "done" });
    await roadmapHandler(asUser(owner, { method: "DELETE", url: `${ROADMAP}?id=${phase.id}` }));
    await roadmapHandler(asUser(owner, { method: "PATCH", url: ROADMAP, body: { id: phase.id, restore: true } }));
    const items = await listItems(owner, project.id);
    expect(items.find((i) => i.id === phase.id)?.task_total).toBe(1);
  });

  it("unlinks tasks (rather than deleting them) if a phase row is hard-deleted", async () => {
    const owner = await createTestUser("ph-hard@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Design");
    const { task } = await jsonBody<{ task: any }>(await addTask(owner, project.id, { phaseId: phase.id }));
    await db().sql`DELETE FROM roadmap_items WHERE id = ${phase.id}`;
    const list = await tasksHandler(asUser(owner, { method: "GET", url: `${TASKS}?projectId=${project.id}` }));
    const found = (await jsonBody<{ tasks: any[] }>(list)).tasks.find((t) => t.id === task.id);
    expect(found).toBeDefined();
    expect(found.roadmap_item_id).toBeNull();
  });

  it("blocks a stranger from linking a task to a phase", async () => {
    const owner = await createTestUser("ph-owner@example.com");
    const stranger = await createTestUser("ph-stranger@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Design");
    const { task } = await jsonBody<{ task: any }>(await addTask(owner, project.id));
    const res = await tasksHandler(asUser(stranger, { method: "PATCH", url: TASKS, body: { id: task.id, phaseId: phase.id } }));
    expect(res.status).toBe(404);
  });

  it("exposes phase task counts on the public roadmap, and nothing else about tasks", async () => {
    const owner = await createTestUser("ph-public@example.com");
    const project = await createTestProject(owner.id);
    const phase = await addItem(owner, project.id, "phase", "Design");
    await addTask(owner, project.id, { title: "Secret task title", phaseId: phase.id, status: "done" });
    await addTask(owner, project.id, { title: "Another", phaseId: phase.id });
    const shared = await projectHandler(
      asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, roadmap_share_enabled: true } })
    );
    const token = (await jsonBody<{ project: any }>(shared)).project.roadmap_share_token;

    const res = await roadmapPublicHandler(new Request(`https://tasketra.com/api/roadmap-public?token=${token}`));
    const text = await res.text();
    const body = JSON.parse(text);
    const item = body.items.find((i: any) => i.id === phase.id);
    expect(item.task_total).toBe(2);
    expect(item.task_done).toBe(1);
    expect(text).not.toContain("Secret task title");
  });
});
