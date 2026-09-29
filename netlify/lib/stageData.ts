import type { db } from "./db.ts";
import { computeEvmMetrics, round2 } from "./evm.ts";
import { charterWritten } from "./charter.ts";
import { evaluateTolerances, sanitizeTolerances } from "./tolerances.ts";
import { isProjectSize } from "./projectSetup.ts";
import { isStage, type Stage, type StageCounts } from "./stageChecklist.ts";

/**
 * Counts what already exists in a project so the pure rules in
 * stageChecklist.ts can turn them into guidance. Shared by /api/stage (one
 * project) and /api/portfolio (the "Next up" line on each Dashboard card).
 * Returns null when the project does not exist.
 */
export async function loadStageInputs(database: ReturnType<typeof db>, projectId: string) {
  const [[project], [taskStats], [stakeholderRow], [riskRow], [issueRow], [crRow], [statusRow], costRows, [baselineRow]] = await Promise.all([
    database.sql`
      SELECT stage, size, budget_at_completion, closure_checklist, charter, tolerances, stage_gates
      FROM projects WHERE id = ${projectId}
    `,
    database.sql`
      SELECT
        count(*)::int AS tasks,
        count(*) FILTER (WHERE due_date IS NOT NULL)::int AS dated_tasks,
        count(*) FILTER (WHERE status = 'blocked')::int AS blocked_tasks,
        count(*) FILTER (WHERE status != 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::int AS overdue_tasks
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`SELECT count(*)::int AS n FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL`,
    database.sql`
      SELECT
        count(*)::int AS risks,
        count(*) FILTER (WHERE status != 'resolved')::int AS open_risks,
        count(*) FILTER (WHERE status != 'resolved' AND updated_at < now() - interval '30 days')::int AS stale_risks,
        count(*) FILTER (WHERE status = 'open' AND (probability = 'high' OR impact = 'high'))::int AS high_risks
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
    database.sql`SELECT count(*)::int AS n FROM project_baselines WHERE project_id = ${projectId}`,
  ]);

  if (!project) return null;

  const stage: Stage = isStage(project.stage) ? project.stage : "plan";
  const size = isProjectSize(project.size) ? project.size : "standard";
  const bac = project.budget_at_completion !== null && project.budget_at_completion !== undefined
    ? Number(project.budget_at_completion) : null;

  // Cost index needs the same leaf-task progress the Budget tab uses.
  let cpi: number | null = null;
  let spi: number | null = null;
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
    const evm = computeEvmMetrics({
      bac, ac, totalTasks: leaf?.total_tasks || 0, doneTasks: leaf?.done_tasks || 0, dueTasks: leaf?.due_tasks || 0,
    });
    cpi = evm.cpi;
    spi = evm.spi;
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
    charterWritten: charterWritten(project.charter),
    baselineLocked: (baselineRow?.n || 0) > 0,
  };

  const escalations = evaluateTolerances(sanitizeTolerances(project.tolerances), {
    cpi, spi, overdueTasks: taskStats?.overdue_tasks || 0, highRisks: riskRow?.high_risks || 0,
  });

  return { stage, size, counts, escalations, gatesEnabled: project.stage_gates === true };
}
