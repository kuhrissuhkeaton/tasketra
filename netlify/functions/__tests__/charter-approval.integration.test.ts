import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import projectHandler from "../project.mts";
import approvalHandler from "../charter-approval.mts";
import decisionPublicHandler from "../decision-public.mts";
import decisionsHandler from "../decisions.mts";

const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const request = (user: { cookie: string }, projectId: string) =>
  approvalHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/charter-approval", body: { projectId } }));
const read = async (user: { cookie: string }, projectId: string) =>
  (await jsonBody<{ approval: any }>(await approvalHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/charter-approval?projectId=${projectId}` })))).approval;
const answer = (token: string, chosenOption: string) =>
  decisionPublicHandler(new Request("https://tasketra.com/api/decision-public", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, chosenOption, responderName: "Dana Reyes" }),
  }));

describe("charter approval", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("has no approval until one is requested", async () => {
    const owner = await createTestUser("appr-none@example.com");
    const project = await createTestProject(owner.id, "P");
    expect(await read(owner, project.id)).toBeNull();
  });

  it("needs a purpose before it can be requested", async () => {
    const owner = await createTestUser("appr-empty@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await request(owner, project.id)).status).toBe(400);
  });

  it("creates a decision the sponsor can answer, and reads the answer back", async () => {
    const owner = await createTestUser("appr-flow@example.com");
    const project = await createTestProject(owner.id, "Clinic");
    await patch(owner, { id: project.id, charter: { purpose: "Open a clinic", sponsor: "Dana" } });
    const res = await request(owner, project.id);
    expect(res.status).toBe(201);
    let approval = await read(owner, project.id);
    expect(approval.status).toBe("pending");
    expect(approval.outdated).toBe(false);

    const decisions = await jsonBody<{ decisions: any[] }>(await decisionsHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/decisions?projectId=${project.id}` })));
    expect(decisions.decisions[0].title).toBe("Approve the charter for Clinic");
    expect(decisions.decisions[0].options).toEqual(["Approve", "Request changes"]);
    expect(decisions.decisions[0].context).toContain("Open a clinic");

    expect((await answer(approval.publicToken, "Approve")).status).toBe(201);
    approval = await read(owner, project.id);
    expect(approval.status).toBe("approved");
    expect(approval.responderName).toBe("Dana Reyes");
  });

  it("reports changes requested", async () => {
    const owner = await createTestUser("appr-changes@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, charter: { purpose: "Why" } });
    await request(owner, project.id);
    const { publicToken } = await read(owner, project.id);
    await answer(publicToken, "Request changes");
    expect((await read(owner, project.id)).status).toBe("changes_requested");
  });

  it("flags the approval as outdated once the charter changes, and a resend replaces it", async () => {
    const owner = await createTestUser("appr-outdated@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, charter: { purpose: "Why" } });
    await request(owner, project.id);
    const first = await read(owner, project.id);
    await patch(owner, { id: project.id, charter: { purpose: "A better why" } });
    expect((await read(owner, project.id)).outdated).toBe(true);
    await request(owner, project.id);
    const second = await read(owner, project.id);
    expect(second.outdated).toBe(false);
    expect(second.decisionId).not.toBe(first.decisionId);
    expect(second.status).toBe("pending");
  });

  it("does not let a stranger read or request it", async () => {
    const owner = await createTestUser("appr-owner@example.com");
    const stranger = await createTestUser("appr-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, charter: { purpose: "Why" } });
    expect((await request(stranger, project.id)).status).toBe(404);
    expect((await approvalHandler(asUser(stranger, { method: "GET", url: `https://tasketra.com/api/charter-approval?projectId=${project.id}` }))).status).toBe(404);
  });
});
