// Applies a project template (src/lib/projectTemplates.ts) to a brand-new
// project: phases and milestones on the roadmap, starter tasks linked to
// their phase, risks, assumptions and placeholder stakeholder roles. Purely
// additive and only called from project creation, so it never touches
// existing data. Dates are offsets from "today" at creation time.

import { getTemplate, planPhases } from "../../src/lib/projectTemplates.ts";

function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function applyProjectTemplate(database: any, projectId: string, userId: string, templateId: string): Promise<boolean> {
  const t = getTemplate(templateId);
  if (!t) return false;

  const planned = planPhases(t);
  const phaseIds: string[] = [];
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const [row] = await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, end_date, status, created_by)
      VALUES (${projectId}, 'phase', ${p.title}, 'General', ${dayOffset(p.startDay)}, ${dayOffset(p.endDay)}, ${i === 0 ? "in_progress" : "not_started"}, ${userId})
      RETURNING id
    `;
    phaseIds.push(row.id);
  }

  for (const m of t.milestones) {
    await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, swimlane, start_date, status, created_by)
      VALUES (${projectId}, ${m.type ?? "milestone"}, ${m.title}, 'General', ${dayOffset(m.day)}, 'not_started', ${userId})
    `;
  }

  for (const task of t.tasks) {
    await database.sql`
      INSERT INTO tasks (project_id, title, due_date, status, roadmap_item_id)
      VALUES (${projectId}, ${task.title}, ${dayOffset(task.day)}, 'not_started', ${phaseIds[task.phase] ?? null})
    `;
  }

  for (const r of t.risks) {
    await database.sql`
      INSERT INTO risks (project_id, title, description, probability, impact, mitigation, status)
      VALUES (${projectId}, ${r.title}, ${r.description}, ${r.probability}, ${r.impact}, ${r.mitigation}, 'open')
    `;
  }

  for (const statement of t.assumptions) {
    await database.sql`
      INSERT INTO assumptions (project_id, statement, status)
      VALUES (${projectId}, ${statement}, 'unconfirmed')
    `;
  }

  for (const s of t.stakeholders) {
    await database.sql`
      INSERT INTO stakeholders (project_id, name, role, interest_level, notes)
      VALUES (${projectId}, ${s.name}, ${s.role}, ${s.interest}, ${s.notes})
    `;
  }
  return true;
}
