import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import tasksHandler from "../tasks.mts";
import decisionsHandler from "../decisions.mts";
import stakeholdersHandler from "../stakeholders.mts";
import workloadHandler from "../workload.mts";

// v162 (F-11 / TA-001): work can be owned by a role, not just a person.
// Tasks assign through the stakeholder_id column that has existed since
// the init migration -- v162 validates it server-side and gives the PATCH
// the set-or-clear semantics it never had. Decisions gain an accountable
// owner through the one new column, owner_stakeholder_id (migration
// 20261117120000_add_decision_owner_stakeholder). Person assignment
// (owner_name, recipients) is untouched throughout.
const TASKS = "https://tasketra.com/api/tasks";
const DECISIONS = "https://tasketra.com/api/decisions";
const STAKEHOLDERS = "https://tasketra.com/api/stakeholders";
const WORKLOAD = "https://tasketra.com/api/workload";

async function addStakeholder(owner: any, projectId: string, name: string, role?: string) {
  const res = await stakeholdersHandler(asUser(owner, {
    method: "POST", url: STAKEHOLDERS, body: { projectId, name, role },
  }));
  expect(res.status).toBe(201);
  return (await jsonBody<{ stakeholder: any }>(res)).stakeholder;
}

async function addTask(owner: any, projectId: string, body: Record<string, unknown> = {}) {
  return tasksHandler(asUser(owner, { method: "POST", url: TASKS, body: { projectId, title: "A task", ...body } }));
}

async function listTasks(owner: any, projectId: string) {
  const res = await tasksHandler(asUser(owner, { method: "GET", url: `${TASKS}?projectId=${projectId}` }));
  return (await jsonBody<{ tasks: any[] }>(res)).tasks;
}

async function patchTask(owner: any, body: Record<string, unknown>) {
  return tasksHandler(asUser(owner, { method: "PATCH", url: TASKS, body }));
}

async function addDecision(owner: any, projectId: string, body: Record<string, unknown> = {}) {
  return decisionsHandler(asUser(owner, {
    method: "POST", url: DECISIONS,
    body: { projectId, title: "A decision", options: ["Yes", "No"], stakeholderIds: [], ...body },
  }));
}

async function listDecisions(owner: any, projectId: string) {
  const res = await decisionsHandler(asUser(owner, { method: "GET", url: `${DECISIONS}?projectId=${projectId}` }));
  return (await jsonBody<{ decisions: any[] }>(res)).decisions;
}

describe("role owners for tasks (v162)", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("creates a task assigned to a stakeholder and returns the link on GET", async () => {
    const owner = await createTestUser("ro-task-create@example.com");
    const project = await createTestProject(owner.id);
    const board = await addStakeholder(owner, project.id, "Change control board");

    const res = await addTask(owner, project.id, { stakeholderId: board.id });
    expect(res.status).toBe(201);
    expect((await jsonBody<{ task: any }>(res)).task.stakeholder_id).toBe(board.id);

    const [task] = await listTasks(owner, project.id);
    expect(task.stakeholder_id).toBe(board.id);
    expect(task.owner_name).toBeNull();
  });

  it("defaults to no stakeholder when omitted, and a typed owner name still works alone", async () => {
    const owner = await createTestUser("ro-task-default@example.com");
    const project = await createTestProject(owner.id);

    const res = await addTask(owner, project.id, { ownerName: "Dana" });
    expect(res.status).toBe(201);
    const { task } = await jsonBody<{ task: any }>(res);
    expect(task.stakeholder_id).toBeNull();
    expect(task.owner_name).toBe("Dana");
  });

  it("rejects a stakeholder from another project, a deleted stakeholder, and an unknown id", async () => {
    const owner = await createTestUser("ro-task-reject@example.com");
    const projectA = await createTestProject(owner.id, "A");
    const projectB = await createTestProject(owner.id, "B");
    const foreign = await addStakeholder(owner, projectB.id, "Other project's sponsor", "Sponsor");

    expect((await addTask(owner, projectA.id, { stakeholderId: foreign.id })).status).toBe(400);
    expect((await addTask(owner, projectA.id, { stakeholderId: crypto.randomUUID() })).status).toBe(400);

    const gone = await addStakeholder(owner, projectA.id, "Soon deleted");
    await stakeholdersHandler(asUser(owner, { method: "DELETE", url: `${STAKEHOLDERS}?id=${gone.id}` }));
    expect((await addTask(owner, projectA.id, { stakeholderId: gone.id })).status).toBe(400);
  });

  it("assigns, changes and clears the stakeholder via PATCH; omitting the key leaves it alone", async () => {
    const owner = await createTestUser("ro-task-patch@example.com");
    const project = await createTestProject(owner.id);
    const sponsor = await addStakeholder(owner, project.id, "Sponsor");
    const board = await addStakeholder(owner, project.id, "Change control board");
    const { task } = await jsonBody<{ task: any }>(await addTask(owner, project.id, { ownerName: "Dana" }));

    // Assign.
    let res = await patchTask(owner, { id: task.id, stakeholderId: sponsor.id });
    expect(res.status).toBe(200);
    expect((await jsonBody<{ task: any }>(res)).task.stakeholder_id).toBe(sponsor.id);

    // An unrelated PATCH (no stakeholderId key) leaves the link in place.
    res = await patchTask(owner, { id: task.id, title: "Renamed" });
    expect((await jsonBody<{ task: any }>(res)).task.stakeholder_id).toBe(sponsor.id);

    // Change.
    res = await patchTask(owner, { id: task.id, stakeholderId: board.id });
    expect((await jsonBody<{ task: any }>(res)).task.stakeholder_id).toBe(board.id);

    // Clear with an explicit null.
    res = await patchTask(owner, { id: task.id, stakeholderId: null });
    expect((await jsonBody<{ task: any }>(res)).task.stakeholder_id).toBeNull();

    const [listed] = await listTasks(owner, project.id);
    expect(listed.stakeholder_id).toBeNull();
    expect(listed.owner_name).toBe("Dana");
  });

  it("rejects a cross-project stakeholder via PATCH", async () => {
    const owner = await createTestUser("ro-task-patch-reject@example.com");
    const projectA = await createTestProject(owner.id, "A");
    const projectB = await createTestProject(owner.id, "B");
    const foreign = await addStakeholder(owner, projectB.id, "Foreign");
    const { task } = await jsonBody<{ task: any }>(await addTask(owner, projectA.id));

    expect((await patchTask(owner, { id: task.id, stakeholderId: foreign.id })).status).toBe(400);
    const [listed] = await listTasks(owner, projectA.id);
    expect(listed.stakeholder_id).toBeNull();
  });

  it("groups a role-owned task under the role's name on Workload", async () => {
    const owner = await createTestUser("ro-workload@example.com");
    const project = await createTestProject(owner.id);
    const board = await addStakeholder(owner, project.id, "Change control board");
    await addTask(owner, project.id, { title: "Board work", stakeholderId: board.id });
    await addTask(owner, project.id, { title: "Dana's work", ownerName: "Dana" });
    await addTask(owner, project.id, { title: "Nobody's work" });

    const res = await workloadHandler(asUser(owner, { method: "GET", url: WORKLOAD }));
    const { tasks } = await jsonBody<{ tasks: any[] }>(res);
    expect(tasks.map((t) => t.owner).sort()).toEqual(["Change control board", "Dana", "Unassigned"]);
  });
});

describe("role owners for decisions (v162)", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("creates a decision with an owner and returns the resolved owner on GET", async () => {
    const owner = await createTestUser("ro-dec-owner@example.com");
    const project = await createTestProject(owner.id);
    const board = await addStakeholder(owner, project.id, "Change control board", "Approvals");

    const res = await addDecision(owner, project.id, { ownerStakeholderId: board.id });
    expect(res.status).toBe(201);
    expect((await jsonBody<{ decision: any }>(res)).decision.owner_stakeholder_id).toBe(board.id);

    const [decision] = await listDecisions(owner, project.id);
    expect(decision.owner_stakeholder_id).toBe(board.id);
    expect(decision.owner).toEqual({ id: board.id, name: "Change control board", role: "Approvals" });
    expect(decision.recipients).toEqual([]);
  });

  it("defaults to no owner when omitted", async () => {
    const owner = await createTestUser("ro-dec-default@example.com");
    const project = await createTestProject(owner.id);

    const res = await addDecision(owner, project.id);
    expect(res.status).toBe(201);
    const [decision] = await listDecisions(owner, project.id);
    expect(decision.owner_stakeholder_id).toBeNull();
    expect(decision.owner).toBeNull();
  });

  it("rejects an owner from another project and a deleted stakeholder as owner", async () => {
    const owner = await createTestUser("ro-dec-reject@example.com");
    const projectA = await createTestProject(owner.id, "A");
    const projectB = await createTestProject(owner.id, "B");
    const foreign = await addStakeholder(owner, projectB.id, "Foreign sponsor", "Sponsor");

    expect((await addDecision(owner, projectA.id, { ownerStakeholderId: foreign.id })).status).toBe(400);
    expect((await addDecision(owner, projectA.id, { ownerStakeholderId: crypto.randomUUID() })).status).toBe(400);

    const gone = await addStakeholder(owner, projectA.id, "Soon deleted");
    await stakeholdersHandler(asUser(owner, { method: "DELETE", url: `${STAKEHOLDERS}?id=${gone.id}` }));
    expect((await addDecision(owner, projectA.id, { ownerStakeholderId: gone.id })).status).toBe(400);
  });

  it("resolves the owner to null once the owning stakeholder is in the Trash", async () => {
    const owner = await createTestUser("ro-dec-trashed@example.com");
    const project = await createTestProject(owner.id);
    const board = await addStakeholder(owner, project.id, "Change control board");
    await addDecision(owner, project.id, { ownerStakeholderId: board.id });

    await stakeholdersHandler(asUser(owner, { method: "DELETE", url: `${STAKEHOLDERS}?id=${board.id}` }));
    const [decision] = await listDecisions(owner, project.id);
    expect(decision.owner).toBeNull();
  });
});
