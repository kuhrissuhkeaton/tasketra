import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import projectHandler from "../project.mts";
import weeklyHandler from "../weekly-report.mts";
import portfolioHandler from "../portfolio.mts";
import approvalHandler from "../charter-approval.mts";
import decisionPublicHandler from "../decision-public.mts";

const patch = (user: { cookie: string }, body: unknown) =>
  projectHandler(asUser(user, { method: "PATCH", url: "https://tasketra.com/api/project", body }));
const report = async (user: { cookie: string }, projectId: string) =>
  jsonBody<any>(await weeklyHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/weekly-report?projectId=${projectId}` })));

describe("charter in the weekly report", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("has no charter block until a purpose is written, but always reports the stage", async () => {
    const owner = await createTestUser("rep-none@example.com");
    const project = await createTestProject(owner.id, "P");
    const r = await report(owner, project.id);
    expect(r.charter).toBeNull();
    expect(r.stage).toBe("plan");
  });

  it("includes purpose, sponsor and success measures", async () => {
    const owner = await createTestUser("rep-charter@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, stage: "execute", charter: { purpose: "Open a clinic", sponsor: "Dana", success: "Doors open by June", budget: "secret" } });
    const r = await report(owner, project.id);
    expect(r.stage).toBe("execute");
    expect(r.charter).toEqual({ purpose: "Open a clinic", sponsor: "Dana", success: "Doors open by June", approval: null });
  });

  it("carries the sponsor's approval answer", async () => {
    const owner = await createTestUser("rep-approval@example.com");
    const project = await createTestProject(owner.id, "P");
    await patch(owner, { id: project.id, charter: { purpose: "Why" } });
    await approvalHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/charter-approval", body: { projectId: project.id } }));
    let r = await report(owner, project.id);
    expect(r.charter.approval).toEqual({ status: "pending", responderName: null });
    const { approval } = await jsonBody<any>(await approvalHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/charter-approval?projectId=${project.id}` })));
    await decisionPublicHandler(new Request("https://tasketra.com/api/decision-public", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: approval.publicToken, chosenOption: "Approve", responderName: "Dana Reyes" }),
    }));
    r = await report(owner, project.id);
    expect(r.charter.approval).toEqual({ status: "approved", responderName: "Dana Reyes" });
  });

  it("does not show a stranger the report", async () => {
    const owner = await createTestUser("rep-owner@example.com");
    const stranger = await createTestUser("rep-stranger@example.com");
    const project = await createTestProject(owner.id, "P");
    expect((await weeklyHandler(asUser(stranger, { method: "GET", url: `https://tasketra.com/api/weekly-report?projectId=${project.id}` }))).status).toBe(404);
  });
});

describe("Next up on the Dashboard", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("names the first open suggestion for each project's stage", async () => {
    const owner = await createTestUser("next-up@example.com");
    const a = await createTestProject(owner.id, "Alpha");
    const b = await createTestProject(owner.id, "Beta");
    await patch(owner, { id: b.id, stage: "initiate" });
    const portfolio = await jsonBody<{ projects: { id: string; nextUp: string | null }[] }>(
      await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" })),
    );
    const byId = Object.fromEntries(portfolio.projects.map((p) => [p.id, p.nextUp]));
    expect(typeof byId[a.id]).toBe("string");
    expect(byId[a.id]!.length).toBeGreaterThan(0);
    expect(byId[b.id]).toBe("Write the charter");
  });
});
