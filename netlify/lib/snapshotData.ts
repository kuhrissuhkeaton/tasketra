// Builds the Client Snapshot payload for one project (v168). Used by
// the public share endpoint; the signed-in preview page assembles the
// same shape from the regular APIs. Privacy contract, same as the other
// share kinds: only what the snapshot page prints leaves the app — no
// ids, no emails, no internal registers, no other projects.
//
// The numbers mirror the Project Cockpit (v165) exactly, by reading the
// same sources the same way:
//   - Completion counts leaf tasks only (the budget endpoint's
//     taskStats rule), while the work breakdown runs the shared
//     workGroups() over every live task, like the cockpit's donut.
//   - Time used is elapsed share of the planned window (roadmap dates).
//   - Budget used is logged costs against the budget at completion.
//   - Status is the PM's own latest check-in (stated health + note),
//     never a computed verdict: the snapshot shows what the PM stated.
//   - Decisions are only the open ones a stakeholder owns (v162), the
//     asks a sponsor can actually act on, with their needed-by dates.

import { workGroups, plannedWindow, daysBetween } from "../../src/lib/workGroups.ts";

export type SnapshotPayload = {
  status: { health: string | null; note: string | null; at: string } | null;
  completion: { done: number; total: number; percent: number } | null;
  time: { percent: number; start: string; end: string } | null;
  budget: { spent: number; total: number; percent: number } | null;
  phases: { label: string; total: number; done: number }[];
  phasesByStatus: boolean;
  milestones: { title: string; date: string; done: boolean }[];
  risks: { title: string; mitigation: string | null }[];
  decisions: { title: string; deadline: string | null; owner: string }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Date columns arrive as Date objects from the driver (the client API
 *  serializes them to strings). Normalize to a YYYY-MM-DD key. */
function dateKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function buildSnapshot(database: any, projectId: string): Promise<SnapshotPayload> {
  const [[project], [taskStats], tasks, items, costRows, [latestStatus], risks, decisions] = await Promise.all([
    database.sql`SELECT budget_at_completion FROM projects WHERE id = ${projectId}`,
    database.sql`
      SELECT
        count(*)::int AS total_tasks,
        count(*) FILTER (WHERE status = 'done')::int AS done_tasks
      FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL
        AND id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
    `,
    database.sql`
      SELECT id, title, status, parent_task_id FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`
      SELECT type, title, start_date, end_date, status FROM roadmap_items
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`SELECT amount FROM cost_entries WHERE project_id = ${projectId}`,
    database.sql`
      SELECT body, health, created_at FROM status_updates
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `,
    database.sql`
      SELECT title, mitigation FROM risks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND status IN ('open', 'monitoring')
      ORDER BY
        CASE WHEN probability = 'high' AND impact = 'high' THEN 0
             WHEN probability = 'high' OR impact = 'high' THEN 1
             WHEN probability = 'medium' AND impact = 'medium' THEN 2
             ELSE 3 END,
        created_at DESC
      LIMIT 3
    `,
    database.sql`
      SELECT dr.title, dr.deadline, s.name AS owner_name
      FROM decision_requests dr
      JOIN stakeholders s ON s.id = dr.owner_stakeholder_id AND s.deleted_at IS NULL
      WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL
        AND dr.status = 'open' AND dr.owner_stakeholder_id IS NOT NULL
      ORDER BY dr.deadline ASC NULLS LAST, dr.created_at ASC
    `,
  ]);

  const total = taskStats?.total_tasks ?? 0;
  const done = taskStats?.done_tasks ?? 0;

  const { groups, byStatus } = tasks.length > 0 ? workGroups(tasks as any) : { groups: [], byStatus: false };

  const windowItems = (items as any[]).map((i) => ({ start_date: dateKey(i.start_date), end_date: dateKey(i.end_date) }));
  const window = plannedWindow(windowItems);
  let time: SnapshotPayload["time"] = null;
  if (window) {
    const [todayRow] = await database.sql`SELECT CURRENT_DATE::text AS today`;
    const today = String(todayRow.today).slice(0, 10);
    const span = daysBetween(window.start, window.end);
    const elapsed = Math.max(0, Math.min(span, daysBetween(window.start, today)));
    time = { percent: pct(elapsed, span), start: window.start, end: window.end };
  }

  const bac = project?.budget_at_completion != null ? Number(project.budget_at_completion) : null;
  const spent = (costRows as any[]).reduce((sum, c) => sum + Number(c.amount), 0);
  const budget = bac !== null ? { spent, total: bac, percent: pct(spent, bac) } : null;

  const milestones = (items as any[])
    .filter((i) => i.type === "milestone")
    .map((i) => ({
      title: i.title as string,
      date: dateKey(i.end_date ?? i.start_date) ?? "",
      done: i.status === "done",
    }))
    .filter((m) => m.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    status: latestStatus
      ? { health: latestStatus.health ?? null, note: latestStatus.body ?? null, at: new Date(latestStatus.created_at).toISOString() }
      : null,
    completion: total > 0 ? { done, total, percent: pct(done, total) } : null,
    time,
    budget,
    phases: groups,
    phasesByStatus: byStatus,
    milestones,
    risks: (risks as any[]).map((r) => ({ title: r.title, mitigation: r.mitigation ?? null })),
    decisions: (decisions as any[]).map((d) => ({
      title: d.title,
      deadline: dateKey(d.deadline),
      owner: d.owner_name,
    })),
  };
}
