import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { computeEvmMetrics } from "../lib/evm.ts";
import { objectiveProgress } from "../lib/okr.ts";
import { projectHealth } from "../lib/portfolioHealth.ts";
import { withSentry } from "../lib/sentry.ts";

// Read-only. The one call the Workload page needs: every open leaf task on
// every project the signed-in user can see (owned or an active member of --
// the same access rule /api/portfolio, /api/my-calendar and /api/weekly-sync
// use), with archived and closed projects out, plus the roadmap milestones
// that fall inside the grid's four-week window. Bucketing happens in the
// browser (src/lib/workloadGrid.ts) against the viewer's local "today",
// like /api/my-today, so the server never re-derives a day from a timestamp.
//
// Two deliberate choices, both pinned by the v147 spec:
// - A task's "owner" is the free-text owner_name the task already carries
//   (trimmed), falling back to the linked stakeholder's name, falling back
//   to "Unassigned". Tasketra has no account-level assignee; inventing one
//   here would misstate who the work belongs to.
// - The milestone window is anchored server-side: windowStart is the Sunday
//   of the current week in UTC, and the window runs 28 days (through the
//   Saturday of the fourth week). The client anchors its week columns on
//   the returned windowStart so the two can never disagree about which
//   week a milestone belongs to; only the overdue line is drawn against
//   the viewer's own local today, as on every other screen. Timezones far
//   from UTC can see the columns shifted by a day against their local
//   week -- accepted for now, the counts themselves stay honest.
//
// Each project's computed health rides along on its tasks (the page flags
// owners whose work sits on at-risk projects): the exact portfolio inputs
// run through the same projectHealth(), so the verdict matches the
// Dashboard's. Dates are formatted with to_char in SQL: some drivers hand
// DATE columns back as Date objects, and the string form of one of those
// is not a date key (the my-calendar lesson). Nothing is written and no
// state lives here. Capped so a large account can't return an unbounded
// list.

const TASK_LIMIT = 2000;
const WINDOW_DAYS = 28;

function dateKeyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The Sunday of the current week in UTC, and the Saturday four weeks on. */
function currentWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS - 1);
  return {
    start: dateKeyOf(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    end: dateKeyOf(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();
  const { start: windowStart, end: windowEnd } = currentWindow();

  const [
    projects,
    perProjectTaskRows,
    perProjectBudgetRows,
    perProjectRiskRows,
    perProjectIssueRows,
    objectiveRows,
    taskRows,
    milestoneRows,
  ] = await Promise.all([
    database.sql`
      SELECT p.id, p.name
      FROM projects p
      WHERE p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
    `,
    // The portfolio's own per-project task rollup (its counts feed
    // projectHealth unchanged, exactly as weekly-sync.mts derives them).
    database.sql`
      SELECT t.project_id,
        count(*) FILTER (WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < now()::date)::int AS overdue_tasks,
        count(*) FILTER (
          WHERE t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE
            AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
        )::int AS leaf_due_tasks,
        count(*) FILTER (
          WHERE t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
        )::int AS leaf_total_tasks,
        count(*) FILTER (
          WHERE t.status = 'done'
            AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
        )::int AS leaf_done_tasks
      FROM tasks t
      WHERE t.deleted_at IS NULL
        AND t.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY t.project_id
    `,
    database.sql`
      SELECT p.id AS project_id, p.budget_at_completion,
        COALESCE((SELECT sum(ce.amount) FROM cost_entries ce WHERE ce.project_id = p.id), 0) AS ac
      FROM projects p
      WHERE p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
    `,
    database.sql`
      SELECT r.project_id,
        count(*) FILTER (WHERE r.status = 'open')::int AS open_count,
        count(*) FILTER (WHERE r.status != 'resolved' AND (CASE WHEN r.probability_score IS NOT NULL AND r.impact_score IS NOT NULL THEN r.probability_score * r.impact_score >= 12 OR r.impact_score = 5 ELSE r.probability = 'high' AND r.impact = 'high' END))::int AS high_count
      FROM risks r
      WHERE r.deleted_at IS NULL
        AND r.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY r.project_id
    `,
    database.sql`
      SELECT i.project_id,
        count(*) FILTER (WHERE i.status != 'resolved')::int AS open_count,
        count(*) FILTER (WHERE i.status != 'resolved' AND i.severity IN ('high', 'critical'))::int AS high_count
      FROM issues i
      WHERE i.deleted_at IS NULL
        AND i.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY i.project_id
    `,
    database.sql`
      SELECT o.id, o.project_id, o.title, o.status,
        COALESCE(
          json_agg(
            json_build_object('metric_type', kr.metric_type, 'start_value', kr.start_value, 'current_value', kr.current_value, 'target_value', kr.target_value)
          ) FILTER (WHERE kr.id IS NOT NULL),
          '[]'::json
        ) AS key_results
      FROM objectives o
      LEFT JOIN key_results kr ON kr.objective_id = o.id AND kr.deleted_at IS NULL
      WHERE o.deleted_at IS NULL
        AND o.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY o.id
    `,
    // The grid's raw material: open leaf tasks only (a parent task's due
    // date is a rollup, not a deadline -- the my-calendar leaf rule). The
    // owner fallback is resolved in SQL so the client never has to know
    // the order: trimmed owner_name, then the stakeholder's name, then the
    // literal "Unassigned".
    database.sql`
      SELECT COALESCE(NULLIF(btrim(t.owner_name), ''), s.name, 'Unassigned') AS owner,
             to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
             t.project_id, p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN stakeholders s ON s.id = t.stakeholder_id
      WHERE t.deleted_at IS NULL
        AND t.status != 'done'
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
      ORDER BY owner, t.due_date NULLS LAST, t.title
      LIMIT ${TASK_LIMIT}
    `,
    // Milestones inside the window only: type 'milestone' alone (releases
    // and events are not milestones, whatever the calendar shows), not
    // done, not deleted.
    database.sql`
      SELECT to_char(ri.start_date, 'YYYY-MM-DD') AS date, ri.title,
             p.name AS project_name
      FROM roadmap_items ri
      JOIN projects p ON p.id = ri.project_id
      WHERE ri.deleted_at IS NULL
        AND ri.type = 'milestone'
        AND ri.status != 'done'
        AND ri.start_date >= ${windowStart}::date
        AND ri.start_date <= ${windowEnd}::date
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY ri.start_date, ri.title
    `,
  ]);

  const taskById = new Map((perProjectTaskRows as any[]).map((r) => [r.project_id, r]));
  const budgetById = new Map((perProjectBudgetRows as any[]).map((r) => [r.project_id, r]));
  const riskById = new Map((perProjectRiskRows as any[]).map((r) => [r.project_id, r]));
  const issueById = new Map((perProjectIssueRows as any[]).map((r) => [r.project_id, r]));

  const objectivesByProject = new Map<string, any[]>();
  for (const o of objectiveRows as any[]) {
    const list = objectivesByProject.get(o.project_id) || [];
    list.push({ ...o, progress: objectiveProgress(o.key_results || []) });
    objectivesByProject.set(o.project_id, list);
  }

  // Health inputs identical to portfolio.mts / weekly-sync.mts, so the
  // verdict matches the Dashboard's for the same project.
  const healthById = new Map<string, ReturnType<typeof projectHealth>>();
  for (const p of projects as any[]) {
    const taskRow = taskById.get(p.id) || { overdue_tasks: 0, leaf_total_tasks: 0, leaf_done_tasks: 0, leaf_due_tasks: 0 };
    const budgetRow = budgetById.get(p.id);
    const riskRow = riskById.get(p.id) || { open_count: 0, high_count: 0 };
    const issueRow = issueById.get(p.id) || { open_count: 0, high_count: 0 };
    const objectives = objectivesByProject.get(p.id) || [];

    const bac = budgetRow?.budget_at_completion !== null && budgetRow?.budget_at_completion !== undefined ? Number(budgetRow.budget_at_completion) : null;
    const ac = budgetRow ? Number(budgetRow.ac) : 0;
    const evm = computeEvmMetrics({
      bac, ac,
      totalTasks: Number(taskRow.leaf_total_tasks) || 0,
      doneTasks: Number(taskRow.leaf_done_tasks) || 0,
      dueTasks: Number(taskRow.leaf_due_tasks) || 0,
    });

    healthById.set(p.id, projectHealth({
      overdueTasks: Number(taskRow.overdue_tasks) || 0,
      highRisks: riskRow.high_count,
      highIssues: issueRow.high_count,
      cpi: evm.cpi,
      spi: evm.spi,
      offTrackObjectives: objectives.filter((o) => o.status === "off_track").length,
      atRiskObjectives: objectives.filter((o) => o.status === "at_risk").length,
    }));
  }

  const tasks = (taskRows as any[]).map((t) => ({
    owner: t.owner as string,
    dueDate: t.due_date as string | null,
    projectId: t.project_id,
    projectName: t.project_name,
    projectHealth: healthById.get(t.project_id) ?? "on_track",
  }));

  const milestones = (milestoneRows as any[]).map((r) => ({
    date: r.date as string,
    title: r.title,
    projectName: r.project_name,
  }));

  return json({ tasks, milestones, windowStart });
});

export const config: Config = { path: "/api/workload" };
