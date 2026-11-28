import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { computeEvmMetrics } from "../lib/evm.ts";
import { objectiveProgress } from "../lib/okr.ts";
import { projectHealth } from "../lib/portfolioHealth.ts";
import { withSentry } from "../lib/sentry.ts";
import { evaluateTolerances, sanitizeTolerances } from "../lib/tolerances.ts";
import { isStage, stageChecklist } from "../lib/stageChecklist.ts";
import { loadStageInputs } from "../lib/stageData.ts";

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
//
// Optional `?projectId=` filter (added for the Dashboard filter bar):
// every query below carries the same
// `AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)`
// clause, so passing no filter behaves exactly as before (the OR NULL branch
// is always true) and passing a projectId narrows every aggregate to that
// one project without duplicating each query into a filtered/unfiltered
// pair. Access to that one project is checked once, up front, via the same
// hasProjectAccess() helper every single-project endpoint already uses --
// not by trusting the WHERE clause alone to keep a stranger's project out.
//
// Optional `?stage=` filter works the same way, narrowing every aggregate to
// projects in one stage (initiate, plan, execute, close). Both filters can
// combine.
//
// v164 (Portfolio Command) additions, all additive -- every field below is
// new in the payload; nothing existing changed shape:
//   - each project summary gains `bac` / `ac` (the budget figures the EVM
//     math already reads) and `plannedStart` / `plannedEnd` (the project's
//     roadmap window: earliest and latest roadmap dates), which the
//     Dashboard's gauges and budget-variance bars draw from;
//   - `openDecisions`: every still-open decision request across the visible
//     projects (closed projects excluded -- a closed project's asks are no
//     longer actionable, the same rule /api/weekly-sync uses), oldest first
//     so "waiting longest" is the head of the list. Feeds the Dashboard's
//     Waiting Longest list and the cross-project Decisions view;
//   - `openRisks` / `openIssues`: the not-resolved risks and issues across
//     the same projects, for the Dashboard's Top Risks list and the
//     cross-project Risks & Issues view. Ordering is applied client-side
//     with the shared exposure comparator, so it cannot drift from the
//     per-project register's order.
// All three lists honor the same projectId/stage filters and are capped at
// 200 rows -- far past any real portfolio's open-item count, and the cap
// keeps a pathological account from turning this rollup into a full dump.

export default withSentry(async (req: Request) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const url = new URL(req.url);
  const requestedProjectId = url.searchParams.get("projectId");
  let filterProjectId: string | null = null;
  if (requestedProjectId) {
    const allowed = await hasProjectAccess(userId, requestedProjectId);
    if (!allowed) return json({ error: "Not found" }, { status: 404 });
    filterProjectId = requestedProjectId;
  }

  const requestedStage = url.searchParams.get("stage");
  if (requestedStage && !isStage(requestedStage)) {
    return json({ error: "stage must be one of initiate, plan, execute, close." }, { status: 400 });
  }
  const filterStage: string | null = requestedStage || null;

  const database = db();

  const [
    projects,
    taskStatusRows,
    issueSeverityRows,
    perProjectTaskRows,
    perProjectBudgetRows,
    perProjectRiskRows,
    perProjectIssueRows,
    objectiveRows,
    milestoneRows,
    undatedMilestoneRows,
    statedRows,
    roadmapWindowRows,
    openDecisionRows,
    openRiskRows,
    openIssueRows,
  ] = await Promise.all([
    database.sql`
      SELECT p.id, p.name, p.created_at, p.stage, p.tolerances, p.closed_at
      FROM projects p
      WHERE p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
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
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
        )
      GROUP BY t.status
    `,
    // Same shape as taskStatusRows, one grouped count per severity, open
    // issues only (matches the "Open issues" KPI's own definition of open:
    // status != 'resolved') -- feeds the Dashboard's new severity donut.
    database.sql`
      SELECT i.severity, count(*)::int AS count
      FROM issues i
      WHERE i.deleted_at IS NULL
        AND i.status != 'resolved'
        AND i.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
        )
      GROUP BY i.severity
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
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
        )
      GROUP BY t.project_id
    `,
    database.sql`
      SELECT p.id AS project_id, p.budget_at_completion,
        COALESCE((SELECT sum(ce.amount) FROM cost_entries ce WHERE ce.project_id = p.id), 0) AS ac
      FROM projects p
      WHERE p.archived = false
        AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
    `,
    database.sql`
      SELECT r.project_id,
        count(*) FILTER (WHERE r.status = 'open')::int AS open_count,
        count(*) FILTER (WHERE r.status != 'resolved' AND (CASE WHEN r.probability_score IS NOT NULL AND r.impact_score IS NOT NULL THEN r.probability_score * r.impact_score >= 12 OR r.impact_score = 5 ELSE r.probability = 'high' AND r.impact = 'high' END))::int AS high_count
      FROM risks r
      WHERE r.deleted_at IS NULL
        AND r.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
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
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
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
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
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
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
      ORDER BY COALESCE(r.start_date, r.end_date) ASC
      LIMIT 5
    `,
    // Milestones with no date can never be "upcoming", so they are invisible
    // above. Count them so the UI can say they exist instead of implying
    // there are no milestones at all.
    database.sql`
      SELECT count(*)::int AS count
      FROM roadmap_items r
      JOIN projects p ON p.id = r.project_id
      WHERE r.type = 'milestone' AND r.status != 'done' AND r.deleted_at IS NULL
        AND r.start_date IS NULL AND r.end_date IS NULL
        AND p.archived = false
        AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
    `,
    // The stated status (v143): each project's most recent status update
    // that carries a health. Plain notes (health NULL) never count, and one
    // DISTINCT ON query covers every project -- no per-project fan-out.
    database.sql`
      SELECT DISTINCT ON (su.project_id) su.project_id, su.health AS stated_health, su.created_at AS stated_at
      FROM status_updates su
      WHERE su.health IS NOT NULL
        AND su.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
        )
      ORDER BY su.project_id, su.created_at DESC
    `,
    // v164: each project's planned window, from its roadmap -- the earliest
    // and latest dates anyone has put on the plan. Projects carry no start
    // or finish columns of their own, so the roadmap is the only honest
    // source for the Time Used gauge's "planned" span. to_char for the same
    // DATE-driver reason as the milestone query above.
    database.sql`
      SELECT r.project_id,
        to_char(min(COALESCE(r.start_date, r.end_date)), 'YYYY-MM-DD') AS planned_start,
        to_char(max(COALESCE(r.end_date, r.start_date)), 'YYYY-MM-DD') AS planned_end
      FROM roadmap_items r
      WHERE r.deleted_at IS NULL
        AND (r.start_date IS NOT NULL OR r.end_date IS NOT NULL)
        AND r.project_id IN (
          SELECT p.id FROM projects p
          WHERE p.archived = false
            AND (p.owner_id = ${userId} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
            AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
        )
      GROUP BY r.project_id
    `,
    // v164: the cross-project asks queue -- the same query /api/weekly-sync
    // runs (same closed-project exclusion, same recipients shape), plus the
    // public token so the Decisions view can offer Copy link / Nudge exactly
    // like the per-project card does. Ordered oldest first: waiting longest
    // is the head of the list.
    database.sql`
      SELECT dr.id, dr.project_id, p.name AS project_name, dr.title, dr.context,
             to_char(dr.deadline, 'YYYY-MM-DD') AS deadline, dr.created_at, dr.public_token,
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
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
      ORDER BY dr.created_at ASC
      LIMIT 200
    `,
    // v164: not-resolved risks across the same projects (closed projects
    // excluded, as with the asks). The client orders them with the shared
    // exposure comparator (src/lib/riskExposure.ts), so this list only
    // needs a stable base order.
    database.sql`
      SELECT r.id, r.project_id, p.name AS project_name, r.title, r.probability, r.impact,
             r.probability_score, r.impact_score, r.status, r.owner_name, r.created_at
      FROM risks r
      JOIN projects p ON p.id = r.project_id
      WHERE r.deleted_at IS NULL
        AND r.status != 'resolved'
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
      ORDER BY r.created_at ASC
      LIMIT 200
    `,
    // v164: not-resolved issues across the same projects, newest first
    // (the client re-sorts by severity for display).
    database.sql`
      SELECT i.id, i.project_id, p.name AS project_name, i.title, i.severity, i.status, i.owner_name, i.created_at
      FROM issues i
      JOIN projects p ON p.id = i.project_id
      WHERE i.deleted_at IS NULL
        AND i.status != 'resolved'
        AND p.archived = false
        AND p.closed_at IS NULL
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND (${filterProjectId}::uuid IS NULL OR p.id = ${filterProjectId}::uuid) AND (${filterStage}::text IS NULL OR p.stage = ${filterStage}::text)
      ORDER BY i.created_at DESC
      LIMIT 200
    `,
  ]);

  const statedById = new Map((statedRows as any[]).map((r) => [r.project_id, r]));
  const windowById = new Map((roadmapWindowRows as any[]).map((r) => [r.project_id, r]));
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

  // The first unfinished suggestion for each project's current stage, shown as
  // a "Next up" line on Dashboard cards. Capped so a very large portfolio does
  // not fan out into hundreds of count queries on every load.
  const NEXT_UP_LIMIT = 30;
  const nextUpByProject = new Map<string, { title: string; tab: string } | null>();
  await Promise.all((projects as any[]).slice(0, NEXT_UP_LIMIT).map(async (p) => {
    try {
      const inputs = await loadStageInputs(database, p.id);
      if (!inputs) return;
      const item = stageChecklist(inputs.stage, inputs.counts, inputs.size).items.find((i) => i.status !== "done");
      // v158: carry the item's tab alongside its title so the Dashboard can
      // link the hint straight to the screen that completes it.
      nextUpByProject.set(p.id, item ? { title: item.title, tab: item.tab } : null);
    } catch {
      // Guidance is optional on the Dashboard; a failed count just hides the line.
    }
  }));

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
      stage: p.stage,
      closed_at: p.closed_at ?? null,
      nextUp: nextUpByProject.get(p.id)?.title ?? null,
      nextUpTab: nextUpByProject.get(p.id)?.tab ?? null,
      escalations: evaluateTolerances(sanitizeTolerances(p.tolerances), {
        cpi: evm.cpi, spi: evm.spi, overdueTasks: Number(taskRow.overdue_tasks) || 0, highRisks: riskRow.high_count,
      }),
      totalTasks: Number(taskRow.total_tasks) || 0,
      doneTasks: Number(taskRow.done_tasks) || 0,
      overdueTasks: Number(taskRow.overdue_tasks) || 0,
      openRisks: riskRow.open_count,
      highRisks: riskRow.high_count,
      openIssues: issueRow.open_count,
      highIssues: issueRow.high_count,
      cpi: evm.cpi,
      spi: evm.spi,
      // v164: the raw budget figures behind the EVM ratios, and the
      // roadmap window, for the Dashboard's variance bars and Time Used
      // gauge. bac is null when no budget was set; plannedStart/End are
      // null when the roadmap carries no dates.
      bac,
      ac,
      plannedStart: windowById.get(p.id)?.planned_start ?? null,
      plannedEnd: windowById.get(p.id)?.planned_end ?? null,
      objectivesCount: objectives.length,
      avgObjectiveProgress,
      health,
      statedHealth: statedById.get(p.id)?.stated_health ?? null,
      statedAt: statedById.get(p.id)?.stated_at ?? null,
    };
  });

  const taskStatusBreakdown = (taskStatusRows as any[]).map((r) => ({ status: r.status, count: r.count }));
  const issueSeverityBreakdown = (issueSeverityRows as any[]).map((r) => ({ severity: r.severity, count: r.count }));
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

  // v164: the cross-project lists, mapped to the same camelCase shape the
  // weekly-sync asks already use so the client reads both the same way.
  const openDecisions = (openDecisionRows as any[]).map((d) => ({
    id: d.id,
    projectId: d.project_id,
    projectName: d.project_name,
    title: d.title,
    context: d.context ?? null,
    deadline: d.deadline as string | null,
    createdAt: d.created_at,
    recipients: (d.recipients as string[] | null) ?? [],
    publicToken: d.public_token,
  }));
  // The score and created_at fields keep their snake_case names here on
  // purpose: src/lib/riskExposure.ts's comparator reads exactly those
  // fields, so the client can sort this list with the shared ordering
  // without an adapter (the same reason the per-project Risk type does).
  const openRisks = (openRiskRows as any[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    probability: r.probability,
    impact: r.impact,
    probability_score: r.probability_score ?? null,
    impact_score: r.impact_score ?? null,
    status: r.status,
    ownerName: r.owner_name ?? null,
    created_at: r.created_at,
  }));
  const openIssues = (openIssueRows as any[]).map((i) => ({
    id: i.id,
    projectId: i.project_id,
    projectName: i.project_name,
    title: i.title,
    severity: i.severity,
    status: i.status,
    ownerName: i.owner_name ?? null,
    createdAt: i.created_at,
  }));

  return json({ kpis, taskStatusBreakdown, issueSeverityBreakdown, projects: projectSummaries, upcomingMilestones, undatedMilestones: undatedMilestoneRows[0]?.count ?? 0, openDecisions, openRisks, openIssues });
});

export const config: Config = { path: "/api/portfolio" };
