import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import projectsHandler from "../projects.mts";
import { PROJECT_TEMPLATES, planPhases } from "../../../src/lib/projectTemplates.ts";

// v83: a new project can start from a template for its type.
const create = (user: { cookie: string }, body: unknown) =>
  projectsHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/projects", body }));

describe("creating a project from a template", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  for (const t of PROJECT_TEMPLATES) {
    it(`seeds the ${t.id} skeleton`, async () => {
      const owner = await createTestUser(`tpl-${t.id}@example.com`);
      const res = await create(owner, { name: "From template", template: t.id });
      expect(res.status).toBe(201);
      const body = await jsonBody<{ project: any; templateApplied: boolean }>(res);
      expect(body.templateApplied).toBe(true);
      const pid = body.project.id;
      const sql = db().sql;

      const phases = await sql`SELECT title, start_date::text AS start_date, end_date::text AS end_date, status FROM roadmap_items WHERE project_id = ${pid} AND type = 'phase' ORDER BY start_date`;
      expect(phases.map((p: any) => p.title)).toEqual(t.phases.map((p) => p.title));
      expect(phases[0].status).toBe("in_progress");
      expect(phases.slice(1).every((p: any) => p.status === "not_started")).toBe(true);
      for (let i = 1; i < phases.length; i++) expect(phases[i].start_date).toBe(phases[i - 1].end_date);

      const milestones = await sql`SELECT title FROM roadmap_items WHERE project_id = ${pid} AND type <> 'phase'`;
      expect(milestones.map((m: any) => m.title).sort()).toEqual(t.milestones.map((m) => m.title).sort());

      const tasks = await sql`SELECT title, status, roadmap_item_id FROM tasks WHERE project_id = ${pid} AND deleted_at IS NULL`;
      expect(tasks).toHaveLength(t.tasks.length);
      expect(tasks.every((x: any) => x.status === "not_started" && x.roadmap_item_id)).toBe(true);

      expect(await sql`SELECT id FROM risks WHERE project_id = ${pid}`).toHaveLength(t.risks.length);
      expect(await sql`SELECT id FROM assumptions WHERE project_id = ${pid}`).toHaveLength(t.assumptions.length);
      expect(await sql`SELECT id FROM stakeholders WHERE project_id = ${pid}`).toHaveLength(t.stakeholders.length);
    });
  }

  it("links each task to the phase its template assigns", async () => {
    const t = PROJECT_TEMPLATES[0];
    const owner = await createTestUser("tpl-link@example.com");
    const { project } = await jsonBody<{ project: any }>(await create(owner, { name: "Linked", template: t.id }));
    const rows = await db().sql`
      SELECT tk.title, r.title AS phase FROM tasks tk JOIN roadmap_items r ON r.id = tk.roadmap_item_id WHERE tk.project_id = ${project.id}
    `;
    const phaseOf = new Map(rows.map((r: any) => [r.title, r.phase]));
    for (const task of t.tasks) expect(phaseOf.get(task.title), task.title).toBe(t.phases[task.phase].title);
  });

  it("dates phases and tasks from today", async () => {
    const t = PROJECT_TEMPLATES[1];
    const owner = await createTestUser("tpl-dates@example.com");
    const { project } = await jsonBody<{ project: any }>(await create(owner, { name: "Dates", template: t.id }));
    const planned = planPhases(t);
    const addDays = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const phase = await db().sql`SELECT start_date::text AS s, end_date::text AS e FROM roadmap_items WHERE project_id = ${project.id} AND title = ${planned[1].title}`;
    expect(phase[0]).toEqual({ s: addDays(planned[1].startDay), e: addDays(planned[1].endDay) });
    const task = t.tasks[0];
    const row = await db().sql`SELECT due_date::text AS d FROM tasks WHERE project_id = ${project.id} AND title = ${task.title}`;
    expect(row[0].d).toBe(addDays(task.day));
  });

  it("fills in the stakeholder contact fields as placeholders", async () => {
    const owner = await createTestUser("tpl-stake@example.com");
    const { project } = await jsonBody<{ project: any }>(await create(owner, { name: "Stakes", template: "software-launch" }));
    const rows = await db().sql`SELECT name, power_level, interest_level, notes, email FROM stakeholders WHERE project_id = ${project.id}`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: any) => ["low", "medium", "high"].includes(r.interest_level) && ["low", "medium", "high"].includes(r.power_level) && r.notes && !r.email)).toBe(true);
  });

  it("rejects an unknown template and creates nothing", async () => {
    const owner = await createTestUser("tpl-bad@example.com");
    expect((await create(owner, { name: "X", template: "spaceship" })).status).toBe(400);
    expect(await db().sql`SELECT id FROM projects WHERE owner_id = ${owner.id}`).toHaveLength(0);
  });

  it("lets a template win over example data instead of doubling up", async () => {
    const owner = await createTestUser("tpl-both@example.com");
    const t = PROJECT_TEMPLATES[2];
    const { project } = await jsonBody<{ project: any }>(await create(owner, { name: "Both", template: t.id, seedExample: true }));
    const tasks = await db().sql`SELECT id FROM tasks WHERE project_id = ${project.id}`;
    expect(tasks).toHaveLength(t.tasks.length);
  });

  it("is unchanged when no template is sent", async () => {
    const owner = await createTestUser("tpl-none@example.com");
    const body = await jsonBody<any>(await create(owner, { name: "Blank" }));
    expect(body.templateApplied).toBeUndefined();
    expect(await db().sql`SELECT id FROM tasks WHERE project_id = ${body.project.id}`).toHaveLength(0);
  });

  it("only seeds the new project, not the owner's other projects", async () => {
    const owner = await createTestUser("tpl-iso@example.com");
    const other = await jsonBody<any>(await create(owner, { name: "Other" }));
    await create(owner, { name: "Templated", template: "construction" });
    expect(await db().sql`SELECT id FROM tasks WHERE project_id = ${other.project.id}`).toHaveLength(0);
  });
});
