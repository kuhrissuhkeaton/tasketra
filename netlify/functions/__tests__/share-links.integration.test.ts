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

  it("snapshot payload carries the stated status, gauges, milestones, plain risks and sponsor decisions only", async () => {
    const owner = await createTestUser("sl-snap@example.com");
    const project = await createTestProject(owner.id, "Summit");
    const database = db();
    await database.sql`UPDATE projects SET budget_at_completion = 1000 WHERE id = ${project.id}`;
    await database.sql`INSERT INTO cost_entries (project_id, description, amount) VALUES (${project.id}, 'Deposit', 250)`;
    await database.sql`
      INSERT INTO tasks (project_id, title, status) VALUES
        (${project.id}, '1.1 Kickoff', 'done'),
        (${project.id}, '1.2 Venue', 'in_progress'),
        (${project.id}, '2.1 Catering', 'not_started')
    `;
    await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, start_date, end_date, status, created_by) VALUES
        (${project.id}, 'phase', 'Planning', '2026-10-01', '2027-02-27', 'in_progress', ${owner.id}),
        (${project.id}, 'milestone', 'Venue booked', NULL, '2026-12-01', 'not_started', ${owner.id})
    `;
    await database.sql`INSERT INTO status_updates (project_id, body, health) VALUES (${project.id}, 'Venue shortlist is down to two.', 'at_risk')`;
    await addRisk(project.id, "Big visible risk", "open");
    await addRisk(project.id, "Quiet resolved risk", "resolved");
    const [sponsor] = await database.sql`
      INSERT INTO stakeholders (project_id, name, email) VALUES (${project.id}, 'Dana Sponsor', 'dana@example.com') RETURNING id
    `;
    await database.sql`
      INSERT INTO decision_requests (project_id, title, status, options, public_token, deadline, owner_stakeholder_id) VALUES
        (${project.id}, 'Approve the catering budget', 'open', '["Yes", "No"]'::jsonb, 'tok-snap-1', '2026-11-25', ${sponsor.id}),
        (${project.id}, 'Internal call', 'open', '["A"]'::jsonb, 'tok-snap-2', NULL, NULL),
        (${project.id}, 'Old settled call', 'resolved', '["A"]'::jsonb, 'tok-snap-3', NULL, ${sponsor.id})
    `;
    const created = await shareLinks(asUser(owner, { method: "POST", url: U, body: { projectId: project.id, kind: "snapshot" } }));
    expect(created.status).toBe(201);
    const token = (await jsonBody<any>(created)).link.token;
    const res = await view(token);
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.kind).toBe("snapshot");
    expect(body.project.name).toBe("Summit");
    const snap = body.snapshot;
    expect(snap.status.health).toBe("at_risk");
    expect(snap.status.note).toBe("Venue shortlist is down to two.");
    expect(snap.completion).toEqual({ done: 1, total: 3, percent: 33 });
    expect(snap.budget).toEqual({ spent: 250, total: 1000, percent: 25 });
    expect(snap.time.start).toBe("2026-10-01");
    expect(snap.time.end).toBe("2027-02-27");
    expect(snap.phases.map((g: any) => g.label)).toEqual(["Phase 1", "Phase 2"]);
    expect(snap.milestones).toEqual([{ title: "Venue booked", date: "2026-12-01", done: false }]);
    expect(snap.risks.map((r: any) => r.title)).toEqual(["Big visible risk"]);
    expect(Object.keys(snap.risks[0]).sort()).toEqual(["mitigation", "title"]);
    expect(snap.decisions).toEqual([{ title: "Approve the catering budget", deadline: "2026-11-25", owner: "Dana Sponsor" }]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("secret detail");
    expect(raw).not.toContain("dana@example.com");
    expect(raw).not.toContain(owner.email);
    expect(raw).not.toContain("tok-snap");
    expect(raw).not.toContain(project.id);
  });

  it("snapshot link stops working when sharing stops", async () => {
    const owner = await createTestUser("sl-snapstop@example.com");
    const project = await createTestProject(owner.id);
    const created = await shareLinks(asUser(owner, { method: "POST", url: U, body: { projectId: project.id, kind: "snapshot" } }));
    const token = (await jsonBody<any>(created)).link.token;
    expect((await view(token)).status).toBe(200);
    const del = await shareLinks(asUser(owner, { method: "DELETE", url: `${U}?projectId=${project.id}&kind=snapshot` }));
    expect(del.status).toBe(200);
    expect((await view(token)).status).toBe(404);
  });
});
