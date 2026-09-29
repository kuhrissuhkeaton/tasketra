import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import projectHandler from "../project.mts";
import gateHandler from "../stage-gate.mts";
import stageHandler from "../stage.mts";
import decisionPublicHandler from "../decision-public.mts";
import decisionsHandler from "../decisions.mts";

const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const ask = (user: { cookie: string }, body: unknown) =>
  gateHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/stage-gate", body }));
const read = async (user: { cookie: string }, projectId: string) =>
  (await jsonBody<{ gate: any }>(await gateHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/stage-gate?projectId=${projectId}` })))).gate;
const answer = (token: string, chosenOption: string) =>
  decisionPublicHandler(new Request("https://tasketra.com/api/decision-public", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, chosenOption, responderName: "Dana Reyes" }),
  }));

describe("stage gates", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("is off by default and the owner can turn it on", async () => {
    const owner = await createTestUser("gate-toggle@example.com");
    const project = await createTestProject(owner.id, "P");
    const stage = () => stageHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/stage?projectId=${project.id}` })).then((r) => jsonBody<any>(r));
    expect((await stage()).gatesEnabled).toBe(false);
    const res = await patch(owner, { id: project.id, stage_gates: true });
    expect(res.status).toBe(200);
    expect((await jsonBody<any>(res)).project.stage_gates).toBe(true);
    expect((await stage()).gatesEnabled).toBe(true);
  });

  it("has no gate until one is requested", async () => {
    const owner = await createTestUser("gate-none@example.com");
    const project = await createTestProject(owner.id, "P");
    expect(await read(owner, project.id)).toBeNull();
  });

  it("creates a decision the sponsor answers, and reads the answer back", async () => {
    const owner = await createTestUser("gate-flow@example.com");
    const project = await createTestProject(owner.id, "Clinic");
    await patch(owner, { id: project.id, charter: { purpose: "Open a clinic" } });
    const res = await ask(owner, { projectId: project.id, from: "plan", to: "execute" });
    expect(res.status).toBe(201);
    let gate = await read(owner, project.id);
    expect(gate).toMatchObject({ from: "plan", to: "execute", status: "pending" });

    const decisions = await jsonBody<{ decisions: any[] }>(await decisionsHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/decisions?projectId=${project.id}` })));
    expect(decisions.decisions[0].title).toBe("Approve moving Clinic from Plan to Execute");
    expect(decisions.decisions[0].context).toContain("Open a clinic");

    await answer(gate.publicToken, "Approve");
    gate = await read(owner, project.id);
    expect(gate.status).toBe("approved");
    expect(gate.responderName).toBe("Dana Reyes");
  });

  it("works without a charter and reports changes requested", async () => {
    const owner = await createTestUser("gate-changes@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await ask(owner, { projectId: project.id, from: "initiate", to: "plan" })).status).toBe(201);
    const { publicToken } = await read(owner, project.id);
    await answer(publicToken, "Request changes");
    expect((await read(owner, project.id)).status).toBe("changes_requested");
  });

  it("remembers only the latest request", async () => {
    const owner = await createTestUser("gate-latest@example.com");
    const project = await createTestProject(owner.id, "P");
    await ask(owner, { projectId: project.id, from: "initiate", to: "plan" });
    await ask(owner, { projectId: project.id, from: "plan", to: "execute" });
    expect(await read(owner, project.id)).toMatchObject({ from: "plan", to: "execute" });
  });

  it("rejects bad stages and strangers", async () => {
    const owner = await createTestUser("gate-owner@example.com");
    const stranger = await createTestUser("gate-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await ask(owner, { projectId: project.id, from: "plan", to: "plan" })).status).toBe(400);
    expect((await ask(owner, { projectId: project.id, from: "plan", to: "nope" })).status).toBe(400);
    expect((await ask(stranger, { projectId: project.id, from: "plan", to: "execute" })).status).toBe(404);
    expect((await gateHandler(asUser(stranger, { method: "GET", url: `https://tasketra.com/api/stage-gate?projectId=${project.id}` }))).status).toBe(404);
  });
});
