import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { sanitizeCharter } from "../lib/charter.ts";
import { approvalStatus } from "../lib/charterApproval.ts";
import { isStage } from "../lib/stageChecklist.ts";
import { computeEvmMetrics, round2 } from "../lib/evm.ts";

// One-click weekly status report: everything that moved on a project in the
// last 7 days, plus a current-state snapshot. Pure aggregation, no new
// records -- built to be skimmed by a stakeholder in under a minute.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [
    tasksCompleted,
    tasksAdded,
    issuesOpened,
    issuesResolved,
    risksOpened,
    risksResolved,
    decisionsMade,
    statusUpdates,
    snapshot,
    [projectRow],
    [budgetRow],
    costRows,
    [evmTaskStats],
  ] = await Promise.all([
    database.sql`
      SELECT id, title, owner_name, updated_at FROM tasks
      WHERE project_id = ${projectId} AND status = 'done' AND deleted_at IS NULL AND updated_at >= now() - interval '7 days'
      ORDER BY updated_at DESC
    `,
    database.sql`
      SELECT id, title, owner_name, due_date, status, created_at, deleted_at FROM tasks
      WHERE project_id = ${projectId} AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, severity, owner_name, created_at FROM issues
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, severity, resolution, resolved_at FROM issues
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at >= now() - interval '7 days'
      ORDER BY resolved_at DESC
    `,
    database.sql`
      SELECT id, title, probability, impact, owner_name, created_at FROM risks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, probability, impact, resolved_at FROM risks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at >= now() - interval '7 days'
      ORDER BY resolved_at DESC
    `,
    database.sql`
      SELECT dr.id, dr.title, rec.chosen_option, rec.responder_name, rec.responded_at, rec.confirmed_at,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.email) AS owner_name
      FROM decision_records rec
      JOIN decision_requests dr ON dr.id = rec.decision_request_id
      JOIN projects p ON p.id = dr.project_id
      JOIN users u ON u.id = p.owner_id
      WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL
        AND COALESCE(rec.confirmed_at, rec.responded_at) >= now() - interval '7 days'
        -- v151: only the OUTCOME record is a decision made (confirmed, or a
        -- pre-v151 single record). Collected responses are not outcomes.
        AND (rec.confirmed_at IS NOT NULL
             OR (dr.status = 'resolved' AND NOT EXISTS (
                   SELECT 1 FROM decision_records c
                   WHERE c.decision_request_id = dr.id AND c.confirmed_at IS NOT NULL)))
      ORDER BY COALESCE(rec.confirmed_at, rec.responded_at) DESC
    `,
    database.sql`
      SELECT id, body, health, created_at FROM status_updates
      WHERE project_id = ${projectId} AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT
        -- "Open task" (v151, the one shared definition): status != 'done'
        -- AND deleted_at IS NULL, counting every task row -- subtasks are
        -- tasks, parents count too. Same words in today.mts / the Next Step
        -- card, so the numbers a user compares across pages agree.
        (SELECT count(*) FROM tasks WHERE project_id = ${projectId} AND status != 'done' AND deleted_at IS NULL) AS open_tasks,
        (SELECT count(*) FROM tasks WHERE project_id = ${projectId} AND status = 'blocked' AND deleted_at IS NULL) AS blocked_tasks,
        (SELECT count(*) FROM issues WHERE project_id = ${projectId} AND status != 'resolved' AND deleted_at IS NULL) AS open_issues,
        (SELECT count(*) FROM issues WHERE project_id = ${projectId} AND status != 'resolved' AND severity IN ('high','critical') AND deleted_at IS NULL) AS urgent_issues,
        (SELECT count(*) FROM risks WHERE project_id = ${projectId} AND status != 'resolved' AND deleted_at IS NULL) AS open_risks,
        (SELECT count(*) FROM decision_requests WHERE project_id = ${projectId} AND status = 'open' AND deleted_at IS NULL) AS open_decisions
    `,
    database.sql`
      SELECT p.stage, p.charter, dr.status AS approval_status, rec.chosen_option, rec.responder_name
      FROM projects p
      LEFT JOIN decision_requests dr ON dr.id = p.charter_decision_id AND dr.deleted_at IS NULL
      LEFT JOIN decision_records rec ON rec.decision_request_id = dr.id
        AND (rec.confirmed_at IS NOT NULL
             OR (dr.status = 'resolved' AND NOT EXISTS (
                   SELECT 1 FROM decision_records c
                   WHERE c.decision_request_id = dr.id AND c.confirmed_at IS NOT NULL)))
      WHERE p.id = ${projectId}
    `,
    database.sql`SELECT budget_at_completion FROM projects WHERE id = ${projectId}`,
    database.sql`SELECT amount FROM cost_entries WHERE project_id = ${projectId}`,
    database.sql`
      SELECT
        count(*)::int AS total_tasks,
        count(*) FILTER (WHERE status = 'done')::int AS done_tasks,
        count(*) FILTER (WHERE due_date IS NOT NULL AND due_date <= CURRENT_DATE)::int AS due_tasks
      FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL
        AND id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
    `,
  ]);

  // The charter rides along so a stakeholder reading the report sees what the
  // project is for. It stays null until a purpose has been written.
  const charter = sanitizeCharter(projectRow?.charter) ?? {};
  const charterBlock = charter.purpose
    ? {
        purpose: charter.purpose,
        sponsor: charter.sponsor ?? null,
        success: charter.success ?? null,
        approval: projectRow?.approval_status
          ? {
              status: approvalStatus({ status: String(projectRow.approval_status), chosen_option: (projectRow.chosen_option as string | null) ?? null }),
              responderName: (projectRow.responder_name as string | null) ?? null,
            }
          : null,
      }
    : null;

  // Budget snapshot for sponsors: same earned-value math as the Budget tab,
  // included only when the project has a budget at completion set.
  const bac = budgetRow?.budget_at_completion !== null && budgetRow?.budget_at_completion !== undefined
    ? Number(budgetRow.budget_at_completion) : null;
  const ac = round2((costRows as any[]).reduce((sum, c) => sum + Number(c.amount), 0));
  const evm = bac !== null
    ? computeEvmMetrics({ bac, ac, totalTasks: evmTaskStats?.total_tasks || 0, doneTasks: evmTaskStats?.done_tasks || 0, dueTasks: evmTaskStats?.due_tasks || 0 })
    : null;
  const budgetBlock = evm
    ? { bac, ac: evm.ac, cpi: evm.cpi, spi: evm.spi, eac: evm.eac, percentComplete: evm.evPercent, tasksDone: evmTaskStats?.done_tasks || 0, tasksTotal: evmTaskStats?.total_tasks || 0 }
    : null;

  // A note that carried a stated status (v143) is prefixed with it in the
  // "Notes posted" list ("At risk — <body>"); plain notes read as before.
  // The raw health rides along on the row for anything that wants it.
  const HEALTH_LABEL: Record<string, string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };
  const reportStatusUpdates = (statusUpdates as any[]).map((s) => {
    const label = s.health ? HEALTH_LABEL[s.health] : null;
    if (!label) return s;
    return { ...s, body: s.body ? `${label} — ${s.body}` : label };
  });

  return json({
    rangeDays: 7,
    generatedAt: new Date().toISOString(),
    budget: budgetBlock,
    tasksCompleted,
    tasksAdded,
    issuesOpened,
    issuesResolved,
    risksOpened,
    risksResolved,
    decisionsMade,
    statusUpdates: reportStatusUpdates,
    snapshot: snapshot[0],
    stage: isStage(projectRow?.stage) ? projectRow.stage : null,
    charter: charterBlock,
  });
});

export const config: Config = { path: "/api/weekly-report" };
