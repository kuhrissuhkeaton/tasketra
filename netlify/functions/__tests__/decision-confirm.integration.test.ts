import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import decisionsHandler from "../decisions.mts";
import decisionPublicHandler from "../decision-public.mts";

// v151 (Part D, Option 1): public responses COLLECT as responses. The
// request stays open until the owner confirms one response as the outcome
// (or records an outcome directly) -- the first reply no longer decides it.
const respond = (token: string, chosenOption: string, responderName: string) =>
  decisionPublicHandler(new Request("https://app.tasketra.com/api/decision-public", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, chosenOption, responderName }),
  }));

const publicGet = async (token: string) =>
  jsonBody<any>(await decisionPublicHandler(new Request(`https://app.tasketra.com/api/decision-public?token=${token}`)));

const listDecisions = async (owner: any, projectId: string) =>
  (await jsonBody<{ decisions: any[] }>(await decisionsHandler(asUser(owner, {
    method: "GET", url: `https://app.tasketra.com/api/decisions?projectId=${projectId}`,
  })))).decisions;

const confirm = (owner: any, body: unknown) =>
  decisionsHandler(asUser(owner, { method: "PATCH", url: "https://app.tasketra.com/api/decisions", body }));

async function makeDecision(owner: any, projectId: string) {
  const res = await decisionsHandler(asUser(owner, {
    method: "POST", url: "https://app.tasketra.com/api/decisions",
    body: { projectId, title: "Which date works best?", options: ["Nov 20", "Nov 27"], stakeholderIds: [] },
  }));
  expect(res.status).toBe(201);
  const { decision } = await jsonBody<any>(res);
  return decision;
}

describe("decision responses collect; the owner confirms (v151)", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("stays open after responses, resolves only on confirm, with the confirmed record as outcome", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);
    const token = decision.public_token;

    // First response: recorded, but the decision is NOT decided.
    expect((await respond(token, "Nov 20", "Sponsor One")).status).toBe(201);
    let pub = await publicGet(token);
    expect(pub.decision.status).toBe("open");
    expect(pub.record).toBeNull();

    // Second response from someone else: also fine (the old rule 409'd it
    // because the first response had already resolved the request).
    expect((await respond(token, "Nov 27", "Stakeholder Two")).status).toBe(201);

    let [d] = await listDecisions(owner, project.id);
    expect(d.status).toBe("open");
    expect(d.chosen_option).toBeNull();
    expect(d.records.map((r: any) => r.chosen_option)).toEqual(["Nov 20", "Nov 27"]);
    expect(d.records.every((r: any) => r.confirmed_at === null)).toBe(true);

    // The owner confirms the SECOND response.
    const secondId = d.records[1].id;
    expect((await confirm(owner, { id: d.id, action: "confirm", recordId: secondId })).status).toBe(200);

    [d] = await listDecisions(owner, project.id);
    expect(d.status).toBe("resolved");
    expect(d.chosen_option).toBe("Nov 27");
    expect(d.responder_name).toBe("Stakeholder Two");
    expect(d.outcome_confirmed_at).toBeTruthy();

    // The public page now shows the confirmed outcome.
    pub = await publicGet(token);
    expect(pub.decision.status).toBe("resolved");
    expect(pub.record.chosen_option).toBe("Nov 27");
    expect(pub.record.responder_name).toBe("Stakeholder Two");

    // No more responses, no re-confirming.
    expect((await respond(token, "Nov 20", "Late Comer")).status).toBe(409);
    expect((await confirm(owner, { id: d.id, action: "confirm", recordId: secondId })).status).toBe(409);
  });

  it("lets the owner record an outcome directly, validated against the options", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);

    expect((await confirm(owner, { id: decision.id, action: "confirm", chosenOption: "Dec 4" })).status).toBe(400);
    expect((await confirm(owner, { id: decision.id, action: "confirm", chosenOption: "Nov 20" })).status).toBe(200);

    const [d] = await listDecisions(owner, project.id);
    expect(d.status).toBe("resolved");
    expect(d.chosen_option).toBe("Nov 20");
    expect(d.outcome_confirmed_at).toBeTruthy();
    expect(d.records).toHaveLength(1);
    expect(d.records[0].confirmed_at).toBeTruthy();
  });

  it("rejects confirming a response that belongs to another decision", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const a = await makeDecision(owner, project.id);
    const b = await makeDecision(owner, project.id);
    await respond(a.public_token, "Nov 20", "Sponsor One");
    const [withRecord] = (await listDecisions(owner, project.id)).filter((d: any) => d.id === a.id);
    const recordId = withRecord.records[0].id;
    expect((await confirm(owner, { id: b.id, action: "confirm", recordId })).status).toBe(404);
    const [bAfter] = (await listDecisions(owner, project.id)).filter((d: any) => d.id === b.id);
    expect(bAfter.status).toBe("open");
  });
});
