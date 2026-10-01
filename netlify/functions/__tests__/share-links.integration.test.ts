import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import shareLinks from "../share-links.mts";
import sharePublic from "../share-public.mts";
import { db } from "../../lib/db.ts";

const U = "https://tasketra.com/api/share-links";
const P = "https://tasketra.com/api/share-public";

async function create(user: any, projectId: string, extra: object = {}) {
  return shareLinks(asUser(user, { method: "POST", url: U, body: { projectId, kind: "risk-matrix", ...extra } }));
}
const view = (token: string) => sharePublic(new Request(`${P}?token=${encodeURIComponent(token)}`));

async function addRisk(projectId: string, title: string, status: string, extra: any = {}) {
  await db().sql`
    INSERT INTO risks (project_id, title, description, probability, impact, mitigation, owner_name, status, deleted_at)
    VALUES (${projectId}, ${title}, ${extra.description ?? "secret detail"}, ${extra.probability ?? "high"}, ${extra.impact ?? "high"},
      ${extra.mitigation ?? "Plan B"}, ${extra.owner ?? "Sam"}, ${status}, ${extra.deleted ? new Date().toISOString() : null})
  `;
}

describe("share links", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("owner creates a link; creating again returns the same token", async () => {
    const owner = await createTestUser("sl-owner@example.com");
    const project = await createTestProject(owner.id);
    const a = await create(owner, project.id);
    expect(a.status).toBe(201);
    const t1 = (await jsonBody<any>(a)).link.token;
    expect(t1.length).toBeGreaterThan(20);
    const b = await create(owner, project.id);
    expect(b.status).toBe(200);
    expect((await jsonBody<any>(b)).link.token).toBe(t1);
    const g = await shareLinks(asUser(owner, { method: "GET", url: `${U}?projectId=${project.id}&kind=risk-matrix` }));
    expect((await jsonBody<any>(g)).link.token).toBe(t1);
  });

  it("GET returns null when nothing is shared", async () => {
    const owner = await createTestUser("sl-none@example.com");
    const project = await createTestProject(owner.id);
    const g = await shareLinks(asUser(owner, { method: "GET", url: `${U}?projectId=${project.id}&kind=risk-matrix` }));
    expect((await jsonBody<any>(g)).link).toBeNull();
  });

  it("rejects unknown kinds and unauthenticated requests", async () => {
    const owner = await createTestUser("sl-kind@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(owner, project.id, { kind: "everything" })).status).toBe(400);
    const anon = await shareLinks(new Request(U, { method: "POST", body: "{}" }));
    expect(anon.status).toBe(401);
  });

  it("only the owner can manage links (not members, not strangers)", async () => {
    const owner = await createTestUser("sl-o2@example.com");
    const member = await createTestUser("sl-m2@example.com");
    const stranger = await createTestUser("sl-s2@example.com");
    const project = await createTestProject(owner.id);
    await db().sql`
      INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
      VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())
    `;
    expect((await create(member, project.id)).status).toBe(404);
    expect((await create(stranger, project.id)).status).toBe(404);
    expect((await create(owner, project.id)).status).toBe(201);
    const del = await shareLinks(asUser(member, { method: "DELETE", url: `${U}?projectId=${project.id}&kind=risk-matrix` }));
    expect(del.status).toBe(404);
  });

  it("public payload has only open/monitoring risks and only printed fields", async () => {
    const owner = await createTestUser("sl-pub@example.com");
    const project = await createTestProject(owner.id, "Launch");
    await addRisk(project.id, "Open one", "open");
    await addRisk(project.id, "Watching", "monitoring", { probability: "low", impact: "low" });
    await addRisk(project.id, "Done", "resolved");
    await addRisk(project.id, "Trashed", "open", { deleted: true });
    const token = (await jsonBody<any>(await create(owner, project.id))).link.token;
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await jsonBody<any>(res);
    expect(body.project.name).toBe("Launch");
    expect(body.risks.map((r: any) => r.title)).toEqual(["Open one", "Watching"]);
    expect(Object.keys(body.risks[0]).sort()).toEqual(["impact", "mitigation", "owner_name", "probability", "status", "title"]);
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(JSON.stringify(body)).not.toContain(owner.email);
  });

  it("stopping sharing makes the link 404", async () => {
    const owner = await createTestUser("sl-stop@example.com");
    const project = await createTestProject(owner.id);
    const token = (await jsonBody<any>(await create(owner, project.id))).link.token;
    expect((await view(token)).status).toBe(200);
    const del = await shareLinks(asUser(owner, { method: "DELETE", url: `${U}?projectId=${project.id}&kind=risk-matrix` }));
    expect(del.status).toBe(200);
    expect((await view(token)).status).toBe(404);
  });

  it("regenerating invalidates the old token and the new one works", async () => {
    const owner = await createTestUser("sl-regen@example.com");
    const project = await createTestProject(owner.id);
    const old = (await jsonBody<any>(await create(owner, project.id))).link.token;
    const fresh = (await jsonBody<any>(await create(owner, project.id, { regenerate: true }))).link.token;
    expect(fresh).not.toBe(old);
    expect((await view(old)).status).toBe(404);
    expect((await view(fresh)).status).toBe(200);
  });

  it("a deleted project's link stops working; unknown/missing tokens fail", async () => {
    const owner = await createTestUser("sl-del@example.com");
    const project = await createTestProject(owner.id);
    const token = (await jsonBody<any>(await create(owner, project.id))).link.token;
    await db().sql`UPDATE projects SET deleted_at = now() WHERE id = ${project.id}`;
    expect((await view(token)).status).toBe(404);
    expect((await view("nope")).status).toBe(404);
    expect((await sharePublic(new Request(P))).status).toBe(400);
  });
});
