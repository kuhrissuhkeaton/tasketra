import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { computeEvmMetrics, round2 } from "../lib/evm.ts";
import { isStage, monitorBand, stageChecklist, type Stage, type StageCounts } from "../lib/stageChecklist.ts";

// Read-only lens behind the stage rail and "Next up" panel on Home. It counts
// what already exists in the project and hands the counts to the pure rules in
// lib/stageChecklist.ts. Changing a project's stage is a PATCH on /api/project.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const database = db();
  const [[project], [taskStats], [stakeholderRow], [riskRow], [issueRow], [crRow], [statusRow], costRows] = await Promise.all([
    database.sql`
      SELECT stage, budget_at_completion, closure_checklist
      FROM projects WHERE id = ${projectId}
    `,
    database.sql`
      SELECT
        count(*)::int AS tasks,
        count(*) FILTER (WHERE due_date IS NOT NULL)::int AS dated_tasks,
        count(*) FILTER (WHERE status = 'blocked')::int AS blocked_tasks
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`SELECT count(*)::int AS n FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`
      SELECT
        count(*)::int AS risks,
        count(*) FILTER (WHERE status != 'resolved')::int AS open_risks,
        count(*) FILTER (WHERE status != 'resolved' AND updated_at < now() - interval '30 days')::int AS stale_risks
      FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`
      SELECT count(*) FILTER (WHERE status != 'resolved')::int AS open_issues
      FROM issues WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`
      SELECT count(*)::int AS n FROM change_requests
      WHERE project_id = ${projectId} AND status = 'proposed' AND deleted_at IS NULL
    `,
    database.sql`
      SELECT count(*)::int AS n FROM status_updates
      WHERE project_id = ${projectId} AND created_at > now() - interval '7 days'
    `,
    database.sql`SELECT amount FROM cost_entries WHERE project_id = ${projectId}`,
  ]);

  if (!project) return json({ error: "Not found" }, { status: 404 });

  const stage: Stage = isStage(project.stage) ? project.stage : "plan";
  const bac = project.budget_at_completion !== null && project.budget_at_completion !== undefined
    ? Number(project.budget_at_completion) : null;

  // Cost index needs the same leaf-task progress the Budget tab uses.
  let cpi: number | null = null;
  if (bac !== null) {
    const [leaf] = await database.sql`
      SELECT
        count(*)::int AS total_tasks,
        count(*) FILTER (WHERE status = 'done')::int AS done_tasks,
        count(*) FILTER (WHERE due_date IS NOT NULL AND due_date <= CURRENT_DATE)::int AS due_tasks
      FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL
        AND id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
    `;
    const ac = round2(costRows.reduce((sum: number, r: any) => sum + Number(r.amount), 0));
    cpi = computeEvmMetrics({
      bac, ac, totalTasks: leaf?.total_tasks || 0, doneTasks: leaf?.done_tasks || 0, dueTasks: leaf?.due_tasks || 0,
    }).cpi;
  }

  const checklistValues = project.closure_checklist && typeof project.closure_checklist === "object"
    ? Object.values(project.closure_checklist as Record<string, unknown>) : [];

  const counts: StageCounts = {
    tasks: taskStats?.tasks || 0,
    datedTasks: taskStats?.dated_tasks || 0,
    stakeholders: stakeholderRow?.n || 0,
    risks: riskRow?.risks || 0,
    hasBudgetBaseline: bac !== null,
    blockedTasks: taskStats?.blocked_tasks || 0,
    openChangeRequests: crRow?.n || 0,
    openRisks: riskRow?.open_risks || 0,
    staleRisks: riskRow?.stale_risks || 0,
    openIssues: issueRow?.open_issues || 0,
    cpi,
    statusUpdatesLast7Days: statusRow?.n || 0,
    closureChecked: checklistValues.filter((v) => v === true).length,
  };

  return json({ stage, checklist: stageChecklist(stage, counts), band: monitorBand(stage, counts) });
});

export const config: Config = { path: "/api/stage" };
