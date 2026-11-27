import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import decisionsHandler from "../decisions.mts";
import decisionPublicHandler from "../decision-public.mts";

// v175: the public decision page becomes a branded record, and the
// endpoint is hardened to the share-public standard. Marshall's six
// conditions, as tests: retraction works (1), the owner gets an off
// switch (3), endpoint hygiene at parity (4), and no new data is
// exposed -- the payload drops the internal id (6). Conditions 2 and 5
// are copy (responder wording, Privacy section 4) and are covered by the
// DecisionPublic component tests and the legal pages themselves.
const respond = (token: string, chosenOption: string, responderName: string) =>
  decisionPublicHandler(new Request("https://app.tasketra.com/api/decision-public", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, chosenOption, responderName }),
  }));

const publicGetRaw = (token: string) =>
  decisionPublicHandler(new Request(`https://app.tasketra.com/api/decision-public?token=${token}`));

const publicGet = async (token: string) => jsonBody<any>(await publicGetRaw(token));

const patch = (user: any, body: unknown) =>
  decisionsHandler(asUser(user, { method: "PATCH", url: "https://app.tasketra.com/api/decisions", body }));

async function makeDecision(owner: any, projectId: string) {
  const res = await decisionsHandler(asUser(owner, {
    method: "POST", url: "https://app.tasketra.com/api/decisions",
    body: { projectId, title: "Which date works best?", options: ["Nov 20", "Nov 27"], stakeholderIds: [] },
  }));
  expect(res.status).toBe(201);
  const { decision } = await jsonBody<any>(res);
  return decision;
}

describe("decision links: retraction, off switch, endpoint parity (v175)", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("serves the record with parity headers and no internal id in the payload", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);

    const res = await publicGetRaw(decision.public_token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const pub = await jsonBody<any>(res);
    expect(pub.decision.title).toBe("Which date works best?");
    expect(pub.decision.project_name).toBe(project.name);
    expect(pub.decision.status).toBe("open");
    // Condition 6: the internal id never leaves the server.
    expect("id" in pub.decision).toBe(false);
    expect(pub.record).toBeNull();
  });

  it("a trashed decision stops resolving and stops accepting responses", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);
    const token = decision.public_token;

    const del = await decisionsHandler(asUser(owner, {
      method: "DELETE", url: `https://app.tasketra.com/api/decisions?id=${decision.id}`,
    }));
    expect(del.status).toBe(200);

    expect((await publicGetRaw(token)).status).toBe(404);
    expect((await respond(token, "Nov 20", "Sponsor One")).status).toBe(404);

    // Restoring the decision brings the link back, and the rejected
    // response was never recorded.
    expect((await patch(owner, { id: decision.id, restore: true })).status).toBe(200);
    const pub = await publicGet(token);
    expect(pub.decision.status).toBe("open");
    expect(pub.record).toBeNull();
  });

  it("a decision inside a trashed project stops resolving and stops accepting responses", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);
    const token = decision.public_token;

    const database = db();
    await database.sql`UPDATE projects SET deleted_at = now() WHERE id = ${project.id}`;

    expect((await publicGetRaw(token)).status).toBe(404);
    expect((await respond(token, "Nov 20", "Sponsor One")).status).toBe(404);
  });

  it("stop sharing rotates the token: the old link dies, the new one resolves", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);
    const oldToken = decision.public_token;

    const res = await patch(owner, { id: decision.id, action: "rotate-share" });
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.public_token).toBeTruthy();
    expect(body.public_token).not.toBe(oldToken);
    expect(body.shareUrl).toBe(`/d/${body.public_token}`);

    expect((await publicGetRaw(oldToken)).status).toBe(404);
    expect((await respond(oldToken, "Nov 20", "Sponsor One")).status).toBe(404);

    const pub = await publicGet(body.public_token);
    expect(pub.decision.title).toBe("Which date works best?");
    expect((await respond(body.public_token, "Nov 20", "Sponsor One")).status).toBe(201);
  });

  it("only someone with project access can stop sharing", async () => {
    const owner = await createTestUser("owner@example.com");
    const stranger = await createTestUser("stranger@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);

    expect((await patch(stranger, { id: decision.id, action: "rotate-share" })).status).toBe(404);

    const unauth = await decisionsHandler(new Request("https://app.tasketra.com/api/decisions", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: decision.id, action: "rotate-share" }),
    }));
    expect(unauth.status).toBe(401);

    // Neither attempt touched the token.
    expect((await publicGetRaw(decision.public_token)).status).toBe(200);
  });

  it("rate limiting trips at the share-public threshold (60 per 10 minutes per IP)", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const decision = await makeDecision(owner, project.id);

    for (let i = 0; i < 60; i++) {
      expect((await publicGetRaw(decision.public_token)).status).toBe(200);
    }
    const limited = await publicGetRaw(decision.public_token);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
