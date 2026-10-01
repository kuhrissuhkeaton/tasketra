// Applies a project template (src/lib/projectTemplates.ts): phases and
// milestones on the roadmap, starter tasks linked to their phase, risks,
// assumptions and placeholder stakeholder roles. Dates are offsets from
// "today". Purely additive: nothing that already exists is changed or deleted.
//
// Two uses:
//  - applyProjectTemplate: a brand-new, empty project (project creation).
//  - applyTemplateToExisting: a project that already has work. Items whose
//    title already exists are skipped (see templatePlan.ts), new tasks link to
//    an existing phase of the same name, and no phase is set to In progress.
//    Running it twice adds nothing the second time, so a half-finished run
//    can simply be run again.

import { getTemplate, type ProjectTemplate } from "../../src/lib/projectTemplates.ts";
import { EMPTY_WORK, planTemplate, summarizePlan, type ExistingWork, type PlanSummary, type TemplatePlan } from "./templatePlan.ts";

function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function insertPlan(database: any, projectId: string, userId: string, plan: TemplatePlan, firstInProgress: boolean) {
  const phaseIds: (string | null)[] = [];
  for (const p of plan.phases) {
    if (p.existingId) {
      phaseIds.push(p.existingId);
      continue;
    }
    const [row] = await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, end_date, status, created_by)
      VALUES (${projectId}, 'phase', ${p.title}, 'General', ${dayOffset(p.startDay)}, ${dayOffset(p.endDay)}, ${firstInProgress && p.index === 0 ? "in_progress" : "not_started"}, ${userId})
      RETURNING id
    `;
    phaseIds.push(row.id);
  }

  for (const m of plan.milestones.filter((x) => !x.exists)) {
    await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, status, created_by)
      VALUES (${projectId}, ${m.type}, ${m.title}, 'General', ${dayOffset(m.day)}, 'not_started', ${userId})
    `;
  }
  for (const task of plan.tasks.filter((x) => !x.exists)) {
    await database.sql`
      INSERT INTO tasks (project_id, title, due_date, status, roadmap_item_id)
      VALUES (${projectId}, ${task.title}, ${dayOffset(task.day)}, 'not_started', ${phaseIds[task.phase] ?? null})
    `;
  }
  for (const r of plan.risks.filter((x) => !x.exists)) {
    await database.sql`
      INSERT INTO risks (project_id, title, description, probability, impact, mitigation, status)
      VALUES (${projectId}, ${r.title}, ${r.description}, ${r.probability}, ${r.impact}, ${r.mitigation}, 'open')
    `;
  }
  for (const a of plan.assumptions.filter((x) => !x.exists)) {
    await database.sql`
      INSERT INTO assumptions (project_id, statement, status)
      VALUES (${projectId}, ${a.statement}, 'unconfirmed')
    `;
  }
  for (const s of plan.stakeholders.filter((x) => !x.exists)) {
    await database.sql`
      INSERT INTO stakeholders (project_id, name, role, interest_level, notes)
      VALUES (${projectId}, ${s.name}, ${s.role}, ${s.interest}, ${s.notes})
    `;
  }
}

/** For a brand-new project: everything is added and the first phase starts In progress. */
export async function applyProjectTemplate(database: any, projectId: string, userId: string, templateId: string): Promise<boolean> {
  const t = getTemplate(templateId);
  if (!t) return false;
  await insertPlan(database, projectId, userId, planTemplate(t, EMPTY_WORK), true);
  return true;
}

export async function loadExistingWork(database: any, projectId: string): Promise<ExistingWork> {
  const [roadmap, tasks, risks, assumptions, stakeholders] = await Promise.all([
    database.sql`SELECT id, type, title FROM roadmap_items WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`SELECT title FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`SELECT title FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`SELECT statement FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`SELECT name FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL`,
  ]);
  return {
    roadmap,
    tasks: tasks.map((r: any) => r.title),
    risks: risks.map((r: any) => r.title),
    assumptions: assumptions.map((r: any) => r.statement),
    stakeholders: stakeholders.map((r: any) => r.name),
  };
}

/** For a project that already has work. With preview, nothing is written. */
export async function applyTemplateToExisting(
  database: any, projectId: string, userId: string, template: ProjectTemplate, opts: { preview: boolean }
): Promise<PlanSummary> {
  const plan = planTemplate(template, await loadExistingWork(database, projectId));
  const summary = summarizePlan(plan);
  if (!opts.preview && summary.totalToAdd > 0) await insertPlan(database, projectId, userId, plan, false);
  return summary;
}
