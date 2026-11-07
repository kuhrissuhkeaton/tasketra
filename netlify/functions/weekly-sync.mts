import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { computeEvmMetrics } from "../lib/evm.ts";
import { objectiveProgress } from "../lib/okr.ts";
import { projectHealth } from "../lib/portfolioHealth.ts";
import { withSentry } from "../lib/sentry.ts";

// Read-only. The one call the Weekly sync page needs: a cross-project rollup
// over every project the signed-in user can see (owned or an active member
// of -- the same access rule /api/portfolio and /api/my-calendar use), with
// archived and closed projects out, as in /api/my-calendar. Per project it
// returns the computed health (the exact portfolio inputs run through the
// same projectHealth(), so the sync page can never disagree with the
// Dashboard about a project's health), the stated status from v143, the
// last-activity timestamp the projects list already derives, and two counts:
// open LEAF tasks past due (the tasks a person can actually act on -- a
// parent task's own due date is a rollup, not a deadline) and open decision
// requests. Alongside, every open decision request on those projects comes
// back as an "ask": title, context, deadline, who it is waiting on, sorted
// by deadline (soonest first, undated last) then by age.
//
// The accessible-projects WHERE clause is repeated as a subquery in every
// aggregate, the same way portfolio.mts does it: each query is its own
// `database.sql` call, and parameterized interpolation (${userId}) is what
// keeps it safe from injection. Nothing is written and no state lives here.

const ASK_LIMIT = 200;

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();

  const [
    projects,
    perProjectTaskRows,
    perProjectBudgetRows,
    perProjectRiskRows,
    perProjectIssueRows,
    objectiveRows,
    statedRows,
    openDecisionRows,
    askRows,
  ] = await Promise.all([
    database.sql`
      SELECT p.id, p.name,
        (SELECT max(al.created_at) FROM activity_log al WHERE al.project_id = p.id) AS last_activity_at
      FROM projects p
      WHERE p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY p.created_at DESC
    `,
    // The portfolio's own per-project task rollup (its overdue count feeds
    // projectHealth unchanged), plus the leaf-only overdue count the sync
    // lines quote: open leaf tasks whose due date has passed. NOTE (v151):
    // these leaf counts are health inputs, deliberately narrower than the
    // shared "open task" display definition (status != 'done', not deleted,
    // every row counts -- see today.mts). Nothing here is labeled "open
    // tasks" to a user, so the two never appear side by side as if equal.
    database.sql`
      SELECT t.project_id,
        count(*) FILTER (WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < now()::date)::int AS overdue_tasks,
        count(*) FILTER (
          WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < now()::date
            AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
        )::int AS leaf_overdue_tasks,
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
        count(*) FILTER (WHERE r.status = 'open' AND (r.probability = 'high' OR r.impact = 'high'))::int AS high_count
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
    // The stated status (v143), exactly as portfolio.mts derives it: each
    // project's most recent status update that carries a health.
    database.sql`
      SELECT DISTINCT ON (su.project_id) su.project_id, su.health AS stated_health, su.created_at AS stated_at
      FROM status_updates su
      WHERE su.health IS NOT NULL
        AND su.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      ORDER BY su.project_id, su.created_at DESC
    `,
    database.sql`
      SELECT dr.project_id, count(*)::int AS open_decisions
      FROM decision_requests dr
      WHERE dr.deleted_at IS NULL
        AND dr.status = 'open'
        AND dr.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false AND p.closed_at IS NULL
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY dr.project_id
    `,
    // The asks queue. deadline is a DATE column, so it is formatted with
    // to_char: some drivers hand DATE columns back as Date objects, and the
    // string form of one of those is not a date key (the my-calendar
    // lesson). Recipients are stakeholder names only, alphabetical for a
    // stable display; an empty array when none were recorded.
    database.sql`
      SELECT dr.id, dr.project_id, p.name AS project_name, dr.title, dr.context,
             to_char(dr.deadline, 'YYYY-MM-DD') AS deadline, dr.created_at,
             COALESCE(
               (SELECT json_agg(s.name ORDER BY s.name)
                  FROM decision_request_recipients rr
                  JOIN stakeholders s ON s.id = rr.stakeholder_id
                  WHERE rr.decision_request_id = dr.id),
               '[]'
             ) AS recipients
      FROM decision_requests dr
      JOIN projects p ON p.id = dr.project_id
      WHERE dr.deleted_at IS NULL
        AND dr.status = 'open'
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY dr.deadline ASC NULLS LAST, dr.created_at ASC
      LIMIT ${ASK_LIMIT}
    `,
  ]);

  const statedById = new Map((statedRows as any[]).map((r) => [r.project_id, r]));
  const taskById = new Map((perProjectTaskRows as any[]).map((r) => [r.project_id, r]));
  const budgetById = new Map((perProjectBudgetRows as any[]).map((r) => [r.project_id, r]));
  const riskById = new Map((perProjectRiskRows as any[]).map((r) => [r.project_id, r]));
  const issueById = new Map((perProjectIssueRows as any[]).map((r) => [r.project_id, r]));
  const decisionsById = new Map((openDecisionRows as any[]).map((r) => [r.project_id, r.open_decisions]));

  const objectivesByProject = new Map<string, any[]>();
  for (const o of objectiveRows as any[]) {
    const list = objectivesByProject.get(o.project_id) || [];
    list.push({ ...o, progress: objectiveProgress(o.key_results || []) });
    objectivesByProject.set(o.project_id, list);
  }

  const projectSummaries = (projects as any[]).map((p) => {
    const taskRow = taskById.get(p.id) || { overdue_tasks: 0, leaf_overdue_tasks: 0, leaf_total_tasks: 0, leaf_done_tasks: 0, leaf_due_tasks: 0 };
    const budgetRow = budgetById.get(p.id);
    const riskRow = riskById.get(p.id) || { open_count: 0, high_count: 0 };
    const issueRow = issueById.get(p.id) || { open_count: 0, high_count: 0 };
    const objectives = objectivesByProject.get(p.id) || [];

    // Health inputs identical to portfolio.mts, so the verdict matches the
    // Dashboard's for the same project.
    const bac = budgetRow?.budget_at_completion !== null && budgetRow?.budget_at_completion !== undefined ? Number(budgetRow.budget_at_completion) : null;
    const ac = budgetRow ? Number(budgetRow.ac) : 0;
    const evm = computeEvmMetrics({
      bac, ac,
      totalTasks: Number(taskRow.leaf_total_tasks) || 0,
      doneTasks: Number(taskRow.leaf_done_tasks) || 0,
      dueTasks: Number(taskRow.leaf_due_tasks) || 0,
    });

    const health = projectHealth({
      overdueTasks: Number(taskRow.overdue_tasks) || 0,
      highRisks: riskRow.high_count,
      highIssues: issueRow.high_count,
      cpi: evm.cpi,
      spi: evm.spi,
      offTrackObjectives: objectives.filter((o) => o.status === "off_track").length,
      atRiskObjectives: objectives.filter((o) => o.status === "at_risk").length,
    });

    return {
      id: p.id,
      name: p.name,
      health,
      statedHealth: statedById.get(p.id)?.stated_health ?? null,
      statedAt: statedById.get(p.id)?.stated_at ?? null,
      lastActivityAt: p.last_activity_at ?? null,
      overdueTasks: Number(taskRow.leaf_overdue_tasks) || 0,
      openDecisions: decisionsById.get(p.id) ?? 0,
    };
  });

  const asks = (askRows as any[]).map((d) => ({
    id: d.id,
    projectId: d.project_id,
    projectName: d.project_name,
    title: d.title,
    context: d.context ?? null,
    deadline: d.deadline as string | null,
    createdAt: d.created_at,
    recipients: (d.recipients as string[] | null) ?? [],
  }));

  return json({ projects: projectSummaries, asks });
});

export const config: Config = { path: "/api/weekly-sync" };
