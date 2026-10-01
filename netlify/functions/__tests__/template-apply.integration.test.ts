import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import templateApply from "../template-apply.mts";
import { getTemplate } from "../../../src/lib/projectTemplates.ts";

const U = "https://tasketra.com/api/template-apply";
const t = getTemplate("software-launch")!;
const call = (user: any, body: object) => templateApply(asUser(user, { method: "POST", url: U, body }));

describe("apply a template to an existing project", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("preview writes nothing and reports what would be added", async () => {
    const owner = await createTestUser("ta-prev@example.com");
    const project = await createTestProject(owner.id);
    const res = await call(owner, { projectId: project.id, templateId: t.id, preview: true });
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.applied).toBe(false);
    expect(body.summary.phases.add).toHaveLength(t.phases.length);
    expect(body.summary.totalToAdd).toBeGreaterThan(20);
    const [{ n }] = await db().sql`SELECT count(*)::int AS n FROM roadmap_items WHERE project_id = ${project.id}`;
    expect(n).toBe(0);
  });

  it("adds alongside existing work, skipping same-titled items, linking new tasks to an existing phase, and never changing existing rows", async () => {
    const owner = await createTestUser("ta-add@example.com");
    const project = await createTestProject(owner.id);
    const sql = db().sql;
    const phaseTitle = t.phases[0].title;
    const [phase] = await sql`INSERT INTO roadmap_items (project_id, type, title, status, start_date) VALUES (${project.id}, 'phase', ${phaseTitle.toLowerCase()}, 'done', '2026-01-01') RETURNING id`;
    const firstTask = t.tasks.find((x) => x.phase === 0)!;
    await sql`INSERT INTO tasks (project_id, title, status) VALUES (${project.id}, ${firstTask.title}, 'in_progress')`;
    await sql`INSERT INTO risks (project_id, title, probability, impact) VALUES (${project.id}, ${t.risks[0].title}, 'low', 'low')`;
    await sql`INSERT INTO stakeholders (project_id, name) VALUES (${project.id}, ${t.stakeholders[0].name})`;

    const res = await call(owner, { projectId: project.id, templateId: t.id });
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.applied).toBe(true);
    expect(body.summary.phases.skip).toEqual([phaseTitle]);
    expect(body.summary.tasks.skip).toEqual([firstTask.title]);

    // existing rows untouched
    const [p] = await sql`SELECT status, title FROM roadmap_items WHERE id = ${phase.id}`;
    expect(p.status).toBe("done");
    expect(p.title).toBe(phaseTitle.toLowerCase());
    const [task] = await sql`SELECT status FROM tasks WHERE project_id = ${project.id} AND title = ${firstTask.title}`;
    expect(task.status).toBe("in_progress");
    const [risk] = await sql`SELECT probability FROM risks WHERE project_id = ${project.id} AND title = ${t.risks[0].title}`;
    expect(risk.probability).toBe("low");

    // totals: each template item exists exactly once
    expect((await sql`SELECT count(*)::int AS n FROM roadmap_items WHERE project_id = ${project.id} AND type = 'phase'`)[0].n).toBe(t.phases.length);
    expect((await sql`SELECT count(*)::int AS n FROM tasks WHERE project_id = ${project.id}`)[0].n).toBe(t.tasks.length);
    expect((await sql`SELECT count(*)::int AS n FROM risks WHERE project_id = ${project.id}`)[0].n).toBe(t.risks.length);
    expect((await sql`SELECT count(*)::int AS n FROM stakeholders WHERE project_id = ${project.id}`)[0].n).toBe(t.stakeholders.length);

    // new tasks of phase 0 hang off the EXISTING phase; no new phase is In progress
    const linked = await sql`SELECT count(*)::int AS n FROM tasks WHERE project_id = ${project.id} AND roadmap_item_id = ${phase.id}`;
    // the pre-existing task is left unlinked (we never edit existing rows); only the newly added ones link
    expect(linked[0].n).toBe(t.tasks.filter((x) => x.phase === 0).length - 1);
    expect((await sql`SELECT count(*)::int AS n FROM roadmap_items WHERE project_id = ${project.id} AND status = 'in_progress'`)[0].n).toBe(0);
  });

  it("running it twice adds nothing the second time", async () => {
    const owner = await createTestUser("ta-twice@example.com");
    const project = await createTestProject(owner.id);
    await call(owner, { projectId: project.id, templateId: t.id });
    const sql = db().sql;
    const before = (await sql`SELECT (SELECT count(*) FROM tasks WHERE project_id = ${project.id})::int AS tasks, (SELECT count(*) FROM roadmap_items WHERE project_id = ${project.id})::int AS items`)[0];
    const res = await call(owner, { projectId: project.id, templateId: t.id });
    const body = await jsonBody<any>(res);
    expect(body.applied).toBe(false);
    expect(body.summary.totalToAdd).toBe(0);
    const after = (await sql`SELECT (SELECT count(*) FROM tasks WHERE project_id = ${project.id})::int AS tasks, (SELECT count(*) FROM roadmap_items WHERE project_id = ${project.id})::int AS items`)[0];
    expect(after).toEqual(before);
  });

  it("ignores soft-deleted items when matching (a deleted task does not block re-adding it)", async () => {
    const owner = await createTestUser("ta-del@example.com");
    const project = await createTestProject(owner.id);
    const sql = db().sql;
    await sql`INSERT INTO tasks (project_id, title, deleted_at) VALUES (${project.id}, ${t.tasks[0].title}, now())`;
    const body = await jsonBody<any>(await call(owner, { projectId: project.id, templateId: t.id, preview: true }));
    expect(body.summary.tasks.skip).toEqual([]);
  });

  it("only the owner can apply; strangers and members get 404; bad input is 400", async () => {
    const owner = await createTestUser("ta-o@example.com");
    const member = await createTestUser("ta-m@example.com");
    const stranger = await createTestUser("ta-s@example.com");
    const project = await createTestProject(owner.id);
    await db().sql`INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at) VALUES (${project.id}, ${member.id}, ${member.email}, 'active', now())`;
    expect((await call(member, { projectId: project.id, templateId: t.id })).status).toBe(404);
    expect((await call(stranger, { projectId: project.id, templateId: t.id })).status).toBe(404);
    expect((await call(owner, { projectId: project.id, templateId: "nope" })).status).toBe(400);
    expect((await call(owner, { templateId: t.id })).status).toBe(400);
    expect((await templateApply(new Request(U, { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await templateApply(asUser(owner, { method: "GET", url: U }))).status).toBe(405);
  });

  it("a deleted project cannot be changed", async () => {
    const owner = await createTestUser("ta-gone@example.com");
    const project = await createTestProject(owner.id);
    await db().sql`UPDATE projects SET deleted_at = now() WHERE id = ${project.id}`;
    expect((await call(owner, { projectId: project.id, templateId: t.id })).status).toBe(404);
  });
});
