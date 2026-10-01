import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import userTemplates from "../user-templates.mts";
import projectsHandler from "../projects.mts";
import templateApply from "../template-apply.mts";

const U = "https://tasketra.com/api/user-templates";
const post = (u: any, body: object) => userTemplates(asUser(u, { method: "POST", url: U, body }));
const list = async (u: any) => (await jsonBody<any>(await userTemplates(asUser(u, { method: "GET", url: U })))).templates;
const del = (u: any, id: string) => userTemplates(asUser(u, { method: "DELETE", url: `${U}?id=${encodeURIComponent(id)}` }));

async function seedProject(email: string) {
  const owner = await createTestUser(email);
  const project = await createTestProject(owner.id, "Office move");
  const sql = db().sql;
  const [phase] = await sql`INSERT INTO roadmap_items (project_id, type, title, start_date, end_date) VALUES (${project.id}, 'phase', 'Pack', '2026-05-01', '2026-05-15') RETURNING id`;
  await sql`INSERT INTO roadmap_items (project_id, type, title, start_date) VALUES (${project.id}, 'milestone', 'Keys handed over', '2026-05-20')`;
  await sql`INSERT INTO tasks (project_id, title, roadmap_item_id, due_date, owner_name, description) VALUES (${project.id}, 'Order boxes', ${phase.id}, '2026-05-03', 'Dana Secret', 'private note')`;
  await sql`INSERT INTO risks (project_id, title, probability, impact, mitigation) VALUES (${project.id}, 'Movers cancel', 'medium', 'high', 'Book a backup')`;
  await sql`INSERT INTO assumptions (project_id, statement, status) VALUES (${project.id}, 'Lift is available', 'confirmed')`;
  await sql`INSERT INTO stakeholders (project_id, name, email) VALUES (${project.id}, 'Real Person', 'real@example.com')`;
  return { owner, project };
}

describe("custom templates", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("preview reports what would be saved and writes nothing", async () => {
    const { owner, project } = await seedProject("ut-prev@example.com");
    const res = await post(owner, { projectId: project.id, preview: true });
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.counts).toMatchObject({ phases: 1, milestones: 1, tasks: 1, risks: 1, assumptions: 1, stakeholders: 0 });
    expect(body.suggestedName).toBe("Office move template");
    expect(await list(owner)).toEqual([]);
  });

  it("saves a template, lists it, and stores no people, notes, owners or dates", async () => {
    const { owner, project } = await seedProject("ut-save@example.com");
    const res = await post(owner, { projectId: project.id, name: "  Office move  ", description: "Our usual move" });
    expect(res.status).toBe(201);
    const { template } = await jsonBody<any>(res);
    expect(template.id).toMatch(/^custom:/);
    expect(template.name).toBe("Office move");
    expect((await list(owner)).map((t: any) => t.name)).toEqual(["Office move"]);
    const [row] = await db().sql`SELECT data FROM user_templates`;
    const text = JSON.stringify(row.data);
    for (const leaked of ["Dana Secret", "private note", "real@example.com", "Real Person", "2026-05"]) expect(text).not.toContain(leaked);
    expect(row.data.stakeholders).toEqual([]);
  });

  it("validates the name, rejects duplicates, empty projects, strangers, and caps the library", async () => {
    const { owner, project } = await seedProject("ut-valid@example.com");
    expect((await post(owner, { projectId: project.id, name: "" })).status).toBe(400);
    expect((await post(owner, { projectId: project.id, name: "x".repeat(81) })).status).toBe(400);
    expect((await post(owner, { projectId: project.id, name: "Mine" })).status).toBe(201);
    expect((await post(owner, { projectId: project.id, name: "mine" })).status).toBe(409);
    const empty = await createTestProject(owner.id, "Empty");
    expect((await post(owner, { projectId: empty.id, name: "Nothing" })).status).toBe(400);
    const stranger = await createTestUser("ut-stranger@example.com");
    expect((await post(stranger, { projectId: project.id, name: "Stolen" })).status).toBe(404);
    for (let i = 0; i < 19; i++) await post(owner, { projectId: project.id, name: `T${i}` });
    const over = await post(owner, { projectId: project.id, name: "One too many" });
    expect(over.status).toBe(400);
    expect((await jsonBody<any>(over)).error).toContain("20");
  });

  it("is private: another person cannot list, use or delete it", async () => {
    const { owner, project } = await seedProject("ut-private@example.com");
    const { template } = await jsonBody<any>(await post(owner, { projectId: project.id, name: "Mine" }));
    const other = await createTestUser("ut-other@example.com");
    expect(await list(other)).toEqual([]);
    expect((await del(other, template.id)).status).toBe(404);
    const otherProject = await createTestProject(other.id, "Theirs");
    const use = await projectsHandler(asUser(other, { method: "POST", url: "https://tasketra.com/api/projects", body: { name: "X", template: template.id } }));
    expect(use.status).toBe(400);
    const apply = await templateApply(asUser(other, { method: "POST", url: "https://tasketra.com/api/template-apply", body: { projectId: otherProject.id, templateId: template.id } }));
    expect(apply.status).toBe(400);
    expect((await list(owner))).toHaveLength(1);
  });

  it("starts a new project from it with the phase, dates counted from today, and nothing marked done", async () => {
    const { owner, project } = await seedProject("ut-new@example.com");
    const { template } = await jsonBody<any>(await post(owner, { projectId: project.id, name: "Move" }));
    const res = await projectsHandler(asUser(owner, { method: "POST", url: "https://tasketra.com/api/projects", body: { name: "Second move", template: template.id } }));
    expect(res.status).toBe(201);
    const body = await jsonBody<any>(res);
    expect(body.templateApplied).toBe(true);
    const sql = db().sql;
    const pid = body.project.id;
    const phases = await sql`SELECT title, status FROM roadmap_items WHERE project_id = ${pid} AND type = 'phase'`;
    expect(phases).toEqual([{ title: "Pack", status: "in_progress" }]);
    const tasks = await sql`SELECT title, status, owner_name, roadmap_item_id FROM tasks WHERE project_id = ${pid}`;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Order boxes", status: "not_started", owner_name: null });
    expect(tasks[0].roadmap_item_id).not.toBeNull();
    expect(await sql`SELECT id FROM risks WHERE project_id = ${pid}`).toHaveLength(1);
    expect(await sql`SELECT id FROM stakeholders WHERE project_id = ${pid}`).toHaveLength(0);
    const [a] = await sql`SELECT status FROM assumptions WHERE project_id = ${pid}`;
    expect(a.status).toBe("unconfirmed");
  });

  it("adds it to an existing project with a preview first, skipping what is there", async () => {
    const { owner, project } = await seedProject("ut-existing@example.com");
    const { template } = await jsonBody<any>(await post(owner, { projectId: project.id, name: "Move" }));
    const target = await createTestProject(owner.id, "Target");
    await db().sql`INSERT INTO tasks (project_id, title) VALUES (${target.id}, 'order boxes')`;
    const call = (preview: boolean) => templateApply(asUser(owner, { method: "POST", url: "https://tasketra.com/api/template-apply", body: { projectId: target.id, templateId: template.id, preview } }));
    const prev = await jsonBody<any>(await call(true));
    expect(prev.applied).toBe(false);
    expect(prev.summary.tasks).toEqual({ add: [], skip: ["Order boxes"] });
    expect(prev.summary.phases.add).toEqual(["Pack"]);
    expect(await db().sql`SELECT id FROM roadmap_items WHERE project_id = ${target.id}`).toHaveLength(0);
    const done = await jsonBody<any>(await call(false));
    expect(done.applied).toBe(true);
    expect((await jsonBody<any>(await call(false))).applied).toBe(false);
  });

  it("deleting a template leaves projects made from it alone; deleting the source project keeps the template", async () => {
    const { owner, project } = await seedProject("ut-delete@example.com");
    const { template } = await jsonBody<any>(await post(owner, { projectId: project.id, name: "Move" }));
    await db().sql`DELETE FROM projects WHERE id = ${project.id}`;
    expect(await list(owner)).toHaveLength(1);
    expect((await del(owner, template.id)).status).toBe(200);
    expect(await list(owner)).toEqual([]);
    expect((await del(owner, template.id)).status).toBe(404);
    expect((await del(owner, "not-a-uuid")).status).toBe(404);
  });
});
