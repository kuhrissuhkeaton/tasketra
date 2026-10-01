import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import raci from "../raci.mts";
import shareLinks from "../share-links.mts";
import sharePublic from "../share-public.mts";
import { db } from "../../lib/db.ts";

const R = "https://tasketra.com/api/raci";

async function setup(email: string) {
  const owner = await createTestUser(email);
  const project = await createTestProject(owner.id, "Launch");
  const database = db();
  const [phase] = await database.sql`INSERT INTO roadmap_items (project_id, type, title) VALUES (${project.id}, 'phase', 'Plan') RETURNING id`;
  const [ms] = await database.sql`INSERT INTO roadmap_items (project_id, type, title) VALUES (${project.id}, 'milestone', 'Go live') RETURNING id`;
  await database.sql`INSERT INTO roadmap_items (project_id, type, title) VALUES (${project.id}, 'note', 'Just a note')`;
  const [sponsor] = await database.sql`INSERT INTO stakeholders (project_id, name, role, email) VALUES (${project.id}, 'Sponsor', 'Exec', 'sponsor@example.com') RETURNING id`;
  return { owner, project, phase: phase.id as string, ms: ms.id as string, sponsor: sponsor.id as string };
}
const put = (user: any, body: object) => raci(asUser(user, { method: "PUT", url: R, body }));
const get = async (user: any, projectId: string) => jsonBody<any>(await raci(asUser(user, { method: "GET", url: `${R}?projectId=${projectId}` })));

describe("raci", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("returns phases and milestones (not notes), the owner and stakeholders as people", async () => {
    const s = await setup("raci-get@example.com");
    const body = await get(s.owner, s.project.id);
    expect(body.rows.map((r: any) => r.title).sort()).toEqual(["Go live", "Plan"]);
    expect(body.people.map((p: any) => p.kind)).toEqual(["team", "stakeholder"]);
    expect(body.people[0].name).toBe("raci-get");
    expect(body.assignments).toEqual([]);
  });

  it("sets, changes and clears a cell for a stakeholder and for a team member", async () => {
    const s = await setup("raci-set@example.com");
    const sKey = `s:${s.sponsor}`;
    const uKey = `u:${s.owner.id}`;
    expect((await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: sKey, role: "A" })).status).toBe(200);
    expect((await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: uKey, role: "AR" })).status).toBe(200);
    let body = await get(s.owner, s.project.id);
    expect(body.assignments).toHaveLength(2);
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: sKey, role: "C" });
    body = await get(s.owner, s.project.id);
    expect(body.assignments.find((a: any) => a.personKey === sKey).role).toBe("C");
    expect(body.assignments).toHaveLength(2);
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: sKey, role: null });
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: uKey, role: null });
    expect((await get(s.owner, s.project.id)).assignments).toEqual([]);
  });

  it("allows more than one Accountable (warned in the app, not blocked)", async () => {
    const s = await setup("raci-twoa@example.com");
    await put(s.owner, { projectId: s.project.id, itemId: s.ms, personKey: `s:${s.sponsor}`, role: "A" });
    await put(s.owner, { projectId: s.project.id, itemId: s.ms, personKey: `u:${s.owner.id}`, role: "A" });
    expect((await get(s.owner, s.project.id)).assignments.filter((a: any) => a.role === "A")).toHaveLength(2);
  });

  it("rejects bad roles, notes, foreign rows and foreign people", async () => {
    const s = await setup("raci-bad@example.com");
    const other = await setup("raci-other@example.com");
    const key = `s:${s.sponsor}`;
    expect((await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: key, role: "X" })).status).toBe(400);
    expect((await put(s.owner, { projectId: s.project.id, itemId: other.phase, personKey: key, role: "R" })).status).toBe(400);
    expect((await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: `s:${other.sponsor}`, role: "R" })).status).toBe(400);
    expect((await put(s.owner, { projectId: s.project.id, personKey: key, role: "R" })).status).toBe(400);
  });

  it("strangers get 404; active members can edit; invited members cannot see", async () => {
    const s = await setup("raci-acc@example.com");
    const stranger = await createTestUser("raci-stranger@example.com");
    const member = await createTestUser("raci-member@example.com");
    expect((await raci(asUser(stranger, { method: "GET", url: `${R}?projectId=${s.project.id}` }))).status).toBe(404);
    expect((await put(stranger, { projectId: s.project.id, itemId: s.phase, personKey: `s:${s.sponsor}`, role: "R" })).status).toBe(404);
    await db().sql`INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at) VALUES (${s.project.id}, ${member.id}, ${member.email}, 'active', now())`;
    expect((await put(member, { projectId: s.project.id, itemId: s.phase, personKey: `u:${member.id}`, role: "R" })).status).toBe(200);
    expect((await get(member, s.project.id)).people.map((p: any) => p.name)).toContain("raci-member");
  });

  it("hides deleted rows and deleted stakeholders and their cells", async () => {
    const s = await setup("raci-del@example.com");
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: `s:${s.sponsor}`, role: "R" });
    await db().sql`UPDATE stakeholders SET deleted_at = now() WHERE id = ${s.sponsor}`;
    let body = await get(s.owner, s.project.id);
    expect(body.people.every((p: any) => p.kind === "team")).toBe(true);
    expect(body.assignments).toEqual([]);
    await db().sql`UPDATE stakeholders SET deleted_at = NULL WHERE id = ${s.sponsor}`;
    await db().sql`UPDATE roadmap_items SET deleted_at = now() WHERE id = ${s.phase}`;
    body = await get(s.owner, s.project.id);
    expect(body.rows.map((r: any) => r.title)).toEqual(["Go live"]);
    expect(body.assignments).toEqual([]);
  });

  it("share link for raci exposes letters and names but no emails or internal ids", async () => {
    const s = await setup("raci-share@example.com");
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: `s:${s.sponsor}`, role: "A" });
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: `u:${s.owner.id}`, role: "R" });
    const created = await shareLinks(asUser(s.owner, { method: "POST", url: "https://tasketra.com/api/share-links", body: { projectId: s.project.id, kind: "raci" } }));
    expect(created.status).toBe(201);
    const token = (await jsonBody<any>(created)).link.token;
    const res = await sharePublic(new Request(`https://tasketra.com/api/share-public?token=${token}`));
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.kind).toBe("raci");
    expect(body.assignments).toHaveLength(2);
    const text = JSON.stringify(body);
    expect(text).not.toContain("@");
    expect(text).not.toContain(s.owner.id);
    expect(text).not.toContain(s.sponsor);
    expect(text).not.toContain(s.project.id);
    expect(body.people.map((p: any) => p.name)).toEqual(["raci-share", "Sponsor"]);
  });
});

describe("raci task rows (v91)", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  const post = (user: any, body: object) => raci(asUser(user, { method: "POST", url: R, body }));
  const del = (user: any, projectId: string, taskId: string) => raci(asUser(user, { method: "DELETE", url: `${R}?projectId=${projectId}&taskId=${taskId}` }));
  async function task(projectId: string, title: string, phaseId: string | null = null) {
    const [t] = await db().sql`INSERT INTO tasks (project_id, title, roadmap_item_id) VALUES (${projectId}, ${title}, ${phaseId}) RETURNING id`;
    return t.id as string;
  }

  it("starts with no task rows, so existing RACIs are unchanged", async () => {
    const s = await setup("rt-none@example.com");
    await task(s.project.id, "Some task", s.phase);
    expect((await get(s.owner, s.project.id)).rows.every((r: any) => r.type !== "task")).toBe(true);
  });

  it("adds a task as a row under its phase; tasks with no phase come last", async () => {
    const s = await setup("rt-add@example.com");
    const inPlan = await task(s.project.id, "Write the plan", s.phase);
    const loose = await task(s.project.id, "Loose task");
    expect((await post(s.owner, { projectId: s.project.id, taskId: loose })).status).toBe(201);
    expect((await post(s.owner, { projectId: s.project.id, taskId: inPlan })).status).toBe(201);
    const { rows } = await get(s.owner, s.project.id);
    expect(rows.map((r: any) => `${r.type}:${r.title}`)).toEqual(["phase:Plan", "task:Write the plan", "milestone:Go live", "task:Loose task"]);
    expect(rows[1].phaseId).toBe(s.phase);
    expect(rows[3].phaseId).toBeNull();
  });

  it("adding the same task twice is harmless", async () => {
    const s = await setup("rt-twice@example.com");
    const t = await task(s.project.id, "T", s.phase);
    await post(s.owner, { projectId: s.project.id, taskId: t });
    expect((await post(s.owner, { projectId: s.project.id, taskId: t })).status).toBe(201);
    expect((await get(s.owner, s.project.id)).rows.filter((r: any) => r.type === "task")).toHaveLength(1);
  });

  it("sets, changes and clears letters on a task row for a stakeholder and a team member", async () => {
    const s = await setup("rt-cells@example.com");
    const t = await task(s.project.id, "T", s.phase);
    await post(s.owner, { projectId: s.project.id, taskId: t });
    const sKey = `s:${s.sponsor}`; const uKey = `u:${s.owner.id}`;
    expect((await put(s.owner, { projectId: s.project.id, itemId: t, personKey: sKey, role: "A" })).status).toBe(200);
    expect((await put(s.owner, { projectId: s.project.id, itemId: t, personKey: uKey, role: "R" })).status).toBe(200);
    await put(s.owner, { projectId: s.project.id, itemId: t, personKey: sKey, role: "C" });
    let body = await get(s.owner, s.project.id);
    expect(body.assignments).toHaveLength(2);
    expect(body.assignments.find((a: any) => a.personKey === sKey).role).toBe("C");
    await put(s.owner, { projectId: s.project.id, itemId: t, personKey: sKey, role: null });
    await put(s.owner, { projectId: s.project.id, itemId: t, personKey: uKey, role: null });
    expect((await get(s.owner, s.project.id)).assignments).toEqual([]);
  });

  it("a task that is not a row cannot take letters", async () => {
    const s = await setup("rt-notrow@example.com");
    const t = await task(s.project.id, "T", s.phase);
    expect((await put(s.owner, { projectId: s.project.id, itemId: t, personKey: `s:${s.sponsor}`, role: "R" })).status).toBe(400);
  });

  it("rejects a task from another project and strangers", async () => {
    const s = await setup("rt-bad@example.com");
    const other = await setup("rt-other@example.com");
    const foreign = await task(other.project.id, "Foreign");
    expect((await post(s.owner, { projectId: s.project.id, taskId: foreign })).status).toBe(400);
    expect((await post(s.owner, { projectId: s.project.id })).status).toBe(400);
    const stranger = await createTestUser("rt-stranger@example.com");
    const t = await task(s.project.id, "T");
    expect((await post(stranger, { projectId: s.project.id, taskId: t })).status).toBe(404);
    expect((await del(stranger, s.project.id, t)).status).toBe(404);
  });

  it("removing a row clears its letters and leaves the task alone; an unchanged phase row keeps its letters", async () => {
    const s = await setup("rt-remove@example.com");
    const t = await task(s.project.id, "T", s.phase);
    await post(s.owner, { projectId: s.project.id, taskId: t });
    await put(s.owner, { projectId: s.project.id, itemId: t, personKey: `s:${s.sponsor}`, role: "R" });
    await put(s.owner, { projectId: s.project.id, itemId: s.phase, personKey: `s:${s.sponsor}`, role: "A" });
    expect((await del(s.owner, s.project.id, t)).status).toBe(200);
    const body = await get(s.owner, s.project.id);
    expect(body.rows.some((r: any) => r.type === "task")).toBe(false);
    expect(body.assignments.map((a: any) => a.itemId)).toEqual([s.phase]);
    expect((await db().sql`SELECT id FROM tasks WHERE id = ${t} AND deleted_at IS NULL`)).toHaveLength(1);
  });

  it("a deleted task disappears from the chart, and a task whose phase is deleted moves to Other tasks", async () => {
    const s = await setup("rt-deleted@example.com");
    const gone = await task(s.project.id, "Gone", s.phase);
    const orphan = await task(s.project.id, "Orphan", s.phase);
    await post(s.owner, { projectId: s.project.id, taskId: gone });
    await post(s.owner, { projectId: s.project.id, taskId: orphan });
    await db().sql`UPDATE tasks SET deleted_at = now() WHERE id = ${gone}`;
    await db().sql`UPDATE roadmap_items SET deleted_at = now() WHERE id = ${s.phase}`;
    const { rows } = await get(s.owner, s.project.id);
    expect(rows.map((r: any) => r.title)).toEqual(["Go live", "Orphan"]);
    expect(rows[1].phaseId).toBeNull();
  });

  it("the share link shows task rows with positional ids only", async () => {
    const s = await setup("rt-share@example.com");
    const t = await task(s.project.id, "Ship the build", s.phase);
    await post(s.owner, { projectId: s.project.id, taskId: t });
    await put(s.owner, { projectId: s.project.id, itemId: t, personKey: `s:${s.sponsor}`, role: "A" });
    const created = await shareLinks(asUser(s.owner, { method: "POST", url: "https://tasketra.com/api/share-links", body: { projectId: s.project.id, kind: "raci" } }));
    const token = (await jsonBody<any>(created)).link.token;
    const body = await jsonBody<any>(await sharePublic(new Request(`https://tasketra.com/api/share-public?token=${token}`)));
    const row = body.rows.find((r: any) => r.type === "task");
    expect(row.title).toBe("Ship the build");
    expect(body.rows.find((r: any) => r.id === row.phaseId).title).toBe("Plan");
    expect(body.assignments).toEqual([{ itemId: row.id, personKey: expect.stringMatching(/^p\d+$/), role: "A" }]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(t);
    expect(text).not.toContain(s.sponsor);
    expect(text).not.toContain("@");
  });
});
