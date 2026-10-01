// Reads everything the RACI matrix needs for one project. Shared by the
// editor endpoint, the public share endpoint and the Word download so they
// can never disagree about who is a column or what is a row.
//
// Rows are roadmap phases and milestones, plus any individual tasks someone
// has chosen to add (not every task: the guidance is to keep a RACI to
// deliverables). A task row sits right under its phase; tasks with no phase
// come last. Columns are the team (owner and active
// members) first, then stakeholders. Person keys are "u:<user id>" or
// "s:<stakeholder id>".

export const RACI_ROLES = ["R", "A", "AR", "C", "I"] as const;
export type RaciRole = (typeof RACI_ROLES)[number];

export function isRaciRole(v: unknown): v is RaciRole {
  return typeof v === "string" && (RACI_ROLES as readonly string[]).includes(v);
}

// type is 'phase', 'milestone' or 'task'. For a task, phaseId is the row it sits
// under (null when it has no phase, so it is listed with "Other tasks").
export type RaciRow = { id: string; type: string; title: string; start_date: string | null; end_date: string | null; phaseId?: string | null };
export type RaciPerson = { key: string; kind: "team" | "stakeholder"; name: string; role: string | null };
export type RaciAssignment = { itemId: string; personKey: string; role: RaciRole };

export async function loadRaci(database: any, projectId: string) {
  const [itemRows, owner, members, stakeholders, raw, taskRows] = await Promise.all([
    database.sql`
      SELECT id, type, title, start_date, end_date FROM roadmap_items
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND type IN ('phase', 'milestone')
      ORDER BY start_date ASC NULLS LAST, created_at ASC
    `,
    database.sql`
      SELECT u.id, u.display_name, u.email, u.job_title FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ${projectId}
    `,
    database.sql`
      SELECT u.id, u.display_name, u.email, u.job_title
      FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ${projectId} AND pm.status = 'active'
      ORDER BY pm.invited_at ASC
    `,
    database.sql`
      SELECT id, name, role FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC
    `,
    database.sql`
      SELECT roadmap_item_id, task_id, stakeholder_id, user_id, role FROM raci_assignments WHERE project_id = ${projectId}
    `,
    database.sql`
      SELECT t.id, t.title, t.roadmap_item_id, t.start_date::text AS start_date, t.due_date::text AS due_date
      FROM raci_task_rows r JOIN tasks t ON t.id = r.task_id
      WHERE r.project_id = ${projectId} AND t.deleted_at IS NULL
      ORDER BY t.created_at ASC
    `,
  ]);

  // Phases and milestones in date order, each followed by the tasks added
  // under it; tasks whose phase is not a row (or that have none) go last.
  const itemIds = new Set(itemRows.map((r: any) => r.id));
  const tasksFor = (itemId: string) => taskRows.filter((t: any) => t.roadmap_item_id === itemId);
  const toTaskRow = (t: any, phaseId: string | null): RaciRow => ({ id: t.id, type: "task", title: t.title, start_date: t.start_date ?? null, end_date: t.due_date ?? null, phaseId });
  const rows: RaciRow[] = [];
  for (const r of itemRows) {
    rows.push(r as RaciRow);
    for (const t of tasksFor(r.id)) rows.push(toTaskRow(t, r.id));
  }
  for (const t of taskRows) if (!t.roadmap_item_id || !itemIds.has(t.roadmap_item_id)) rows.push(toTaskRow(t, null));

  // Never expose a full email: fall back to the part before the @.
  const teamName = (u: any) => (u.display_name || String(u.email).split("@")[0]) as string;
  const seen = new Set<string>();
  const people: RaciPerson[] = [];
  for (const u of [...owner, ...members]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    people.push({ key: `u:${u.id}`, kind: "team", name: teamName(u), role: u.job_title ?? null });
  }
  for (const s of stakeholders) people.push({ key: `s:${s.id}`, kind: "stakeholder", name: s.name, role: s.role ?? null });

  const rowIds = new Set(rows.map((r: any) => r.id));
  const personKeys = new Set(people.map((p) => p.key));
  const assignments: RaciAssignment[] = [];
  for (const a of raw) {
    const personKey = a.stakeholder_id ? `s:${a.stakeholder_id}` : `u:${a.user_id}`;
    const itemId = a.roadmap_item_id ?? a.task_id;
    if (rowIds.has(itemId) && personKeys.has(personKey)) {
      assignments.push({ itemId, personKey, role: a.role });
    }
  }
  return { rows, people, assignments };
}
