// Reads everything the RACI matrix needs for one project. Shared by the
// editor endpoint, the public share endpoint and the Word download so they
// can never disagree about who is a column or what is a row.
//
// Rows are roadmap phases and milestones (not every task: the guidance is to
// keep a RACI to deliverables). Columns are the team (owner and active
// members) first, then stakeholders. Person keys are "u:<user id>" or
// "s:<stakeholder id>".

export const RACI_ROLES = ["R", "A", "AR", "C", "I"] as const;
export type RaciRole = (typeof RACI_ROLES)[number];

export function isRaciRole(v: unknown): v is RaciRole {
  return typeof v === "string" && (RACI_ROLES as readonly string[]).includes(v);
}

export type RaciRow = { id: string; type: string; title: string; start_date: string | null; end_date: string | null };
export type RaciPerson = { key: string; kind: "team" | "stakeholder"; name: string; role: string | null };
export type RaciAssignment = { itemId: string; personKey: string; role: RaciRole };

export async function loadRaci(database: any, projectId: string) {
  const [rows, owner, members, stakeholders, raw] = await Promise.all([
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
      SELECT roadmap_item_id, stakeholder_id, user_id, role FROM raci_assignments WHERE project_id = ${projectId}
    `,
  ]);

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
    if (rowIds.has(a.roadmap_item_id) && personKeys.has(personKey)) {
      assignments.push({ itemId: a.roadmap_item_id, personKey, role: a.role });
    }
  }
  return { rows: rows as RaciRow[], people, assignments };
}
