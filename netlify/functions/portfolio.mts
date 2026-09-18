import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { computeEvmMetrics } from "../lib/evm.ts";
import { objectiveProgress } from "../lib/okr.ts";
import { projectHealth } from "../lib/portfolioHealth.ts";
import { withSentry } from "../lib/sentry.ts";

// The one call the portfolio Dashboard needs -- everything on it is a
// read-only rollup across every project the signed-in user can see (owned or
// an active member of), the same access rule /api/projects already uses for
// its own list. No new state lives here; this just aggregates what each
// project's own tabs (Tasks, Budget, RAID, OKRs, Roadmap) already track, the
// same way /api/today rolls up one project's own data for its Home tab.
//
// The same accessible-projects WHERE clause (owner or active member, not
// archived) is repeated as a subquery in every aggregate below rather than
// factored into a shared CTE, since each of these runs as its own
// `database.sql` call -- there's no way to share a WITH clause across
// separate tagged-template calls, and parameterized interpolation
// (${userId}) is what keeps this safe from injection, so the subquery is
// repeated rather than built via string concatenation.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const database = db();

  const [
    projects,
    taskStatusRows,
    perProjectTaskRows,
    perProjectBudgetRows,
    perProjectRiskRows,
    perProjectIssueRows,
    objectiveRows,
    milestoneRows,
  ] = await Promise.all([
    database.sql`
      SELECT p.id, p.name, p.created_at
      FROM projects p
      WHERE p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY p.created_at DESC
    `,
    database.sql`
      SELECT t.status, count(*)::int AS count
      FROM tasks t
      WHERE t.deleted_at IS NULL
        AND t.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY t.status
    `,
    database.sql`
      SELECT t.project_id,
        count(*)::int AS total_tasks,
        count(*) FILTER (WHERE t.status = 'done')::int AS done_tasks,
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
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY t.project_id
    `,
    database.sql`
      SELECT p.id AS project_id, p.budget_at_completion,
        COALESCE((SELECT sum(ce.amount) FROM cost_entries ce WHERE ce.project_id = p.id), 0) AS ac
      FROM projects p
      WHERE p.archived = false
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
          WHERE p.archived = false
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
          WHERE p.archived = false
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
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        )
      GROUP BY o.id
    `,
    database.sql`
      SELECT r.id, r.title, r.start_date, r.end_date, r.status, p.id AS project_id, p.name AS project_name
      FROM roadmap_items r
      JOIN projects p ON p.id = r.project_id
      WHERE r.type = 'milestone' AND r.status != 'done' AND r.deleted_at IS NULL
        AND COALESCE(r.start_date, r.end_date) IS NOT NULL
        AND p.archived = false
        AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY COALESCE(r.start_date, r.end_date) ASC
      LIMIT 5
    `,
  ]);

  const taskById = new Map(perProjectTaskRows.map((r: any) => [r.project_id, r]));
  const budgetById = new Map(perProjectBudgetRows.map((r: any) => [r.project_id, r]));
  const riskById = new Map(perProjectRiskRows.map((r: any) => [r.project_id, r]));
  const issueById = new Map(perProjectIssueRows.map((r: any) => [r.project_id, r]));

  const objectivesByProject = new Map<string, any[]>();
  for (const o of objectiveRows as any[]) {
    const list = objectivesByProject.get(o.project_id) || [];
    list.push({ ...o, progress: objectiveProgress(o.key_results || []) });
    objectivesByProject.set(o.project_id, list);
  }

  const projectSummaries = (projects as any[]).map((p) => {
    const taskRow = taskById.get(p.id) || { total_tasks: 0, done_tasks: 0, overdue_tasks: 0, leaf_total_tasks: 0, leaf_done_tasks: 0, leaf_due_tasks: 0 };
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

    const offTrackObjectives = objectives.filter((o) => o.status === "off_track").length;
    const atRiskObjectives = objectives.filter((o) => o.status === "at_risk").length;
    const avgObjectiveProgress = objectives.length > 0
      ? Math.round((objectives.reduce((sum, o) => sum + (o.progress ?? 0), 0) / objectives.length) * 10) / 10
      : null;

    const health = projectHealth({
      overdueTasks: Number(taskRow.overdue_tasks) || 0,
      highRisks: riskRow.high_count,
      highIssues: issueRow.high_count,
      cpi: evm.cpi,
      spi: evm.spi,
      offTrackObjectives,
      atRiskObjectives,
    });

    return {
      id: p.id,
      name: p.name,
      totalTasks: Number(taskRow.total_tasks) || 0,
      doneTasks: Number(taskRow.done_tasks) || 0,
      overdueTasks: Number(taskRow.overdue_tasks) || 0,
      openRisks: riskRow.open_count,
      highRisks: riskRow.high_count,
      openIssues: issueRow.open_count,
      highIssues: issueRow.high_count,
      cpi: evm.cpi,
      spi: evm.spi,
      objectivesCount: objectives.length,
      avgObjectiveProgress,
      health,
    };
  });

  const taskStatusBreakdown = (taskStatusRows as any[]).map((r) => ({ status: r.status, count: r.count }));
  const allObjectives = Array.from(objectivesByProject.values()).flat();
  const objectiveProgressValues = allObjectives.map((o) => o.progress).filter((p): p is number => p !== null);

  const kpis = {
    activeProjects: projectSummaries.length,
    atRiskProjects: projectSummaries.filter((p) => p.health === "at_risk").length,
    offTrackProjects: projectSummaries.filter((p) => p.health === "off_track").length,
    overdueTasks: projectSummaries.reduce((sum, p) => sum + p.overdueTasks, 0),
    openRisks: projectSummaries.reduce((sum, p) => sum + p.openRisks, 0),
    openIssues: projectSummaries.reduce((sum, p) => sum + p.openIssues, 0),
    highIssues: projectSummaries.reduce((sum, p) => sum + p.highIssues, 0),
    totalObjectives: allObjectives.length,
    objectivesOnTrack: allObjectives.filter((o) => o.status === "on_track").length,
    objectivesAtRisk: allObjectives.filter((o) => o.status === "at_risk").length,
    objectivesOffTrack: allObjectives.filter((o) => o.status === "off_track").length,
    objectivesAchieved: allObjectives.filter((o) => o.status === "achieved").length,
    avgObjectiveProgress: objectiveProgressValues.length > 0
      ? Math.round((objectiveProgressValues.reduce((sum, p) => sum + p, 0) / objectiveProgressValues.length) * 10) / 10
      : null,
  };

  const upcomingMilestones = (milestoneRows as any[]).map((r) => ({
    id: r.id, title: r.title, date: r.start_date || r.end_date, status: r.status,
    projectId: r.project_id, projectName: r.project_name,
  }));

  return json({ kpis, taskStatusBreakdown, projects: projectSummaries, upcomingMilestones });
});

export const config: Config = { path: "/api/portfolio" };
