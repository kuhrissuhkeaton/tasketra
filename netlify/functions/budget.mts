import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { round2, computeEvmMetrics } from "../lib/evm.ts";

// Lightweight Earned Value Management: a project's budget baseline (BAC) plus
// logged actual costs, compared against schedule/scope progress already
// tracked by tasks. PV% and EV% share the same denominator (total tasks) so
// PV and EV are directly comparable dollar figures against BAC.
//
//   PV% = tasks due on/before today ÷ total tasks
//   EV% = tasks marked done ÷ total tasks
//
// Only leaf tasks (no sub-tasks of their own) count toward these totals --
// standard WBS practice loads budget onto work packages, not summary/parent
// tasks, so a parent task finishing doesn't inflate progress on its own.
//   AC  = sum of logged cost entries
//   CV = EV - AC        SV = EV - PV
//   CPI = EV / AC       SPI = EV / PV
//   EAC = BAC / CPI      VAC = BAC - EAC
//   TCPI = (BAC - EV) / (BAC - AC)
//
// The actual metric math lives in lib/evm.ts (computeEvmMetrics), unit
// tested in lib/__tests__/evm.test.ts -- kept here as pure arithmetic so it
// can be tested without a database.

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [[project], costEntries, [taskStats]] = await Promise.all([
      database.sql`SELECT budget_at_completion FROM projects WHERE id = ${projectId}`,
      database.sql`
        SELECT id, description, amount, incurred_date, created_at FROM cost_entries
        WHERE project_id = ${projectId} ORDER BY incurred_date DESC, created_at DESC
      `,
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

    const bac = project?.budget_at_completion !== null && project?.budget_at_completion !== undefined
      ? Number(project.budget_at_completion) : null;
    const ac = round2(costEntries.reduce((sum: number, c: any) => sum + Number(c.amount), 0));
    const totalTasks = taskStats?.total_tasks || 0;
    const doneTasks = taskStats?.done_tasks || 0;
    const dueTasks = taskStats?.due_tasks || 0;

    const metrics = computeEvmMetrics({ bac, ac, totalTasks, doneTasks, dueTasks });

    return json({
      budgetAtCompletion: bac,
      costEntries,
      taskStats: { totalTasks, doneTasks, dueTasks },
      metrics,
    });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    const bac = body?.budgetAtCompletion;
    if (bac !== null && (typeof bac !== "number" || bac < 0)) {
      return json({ error: "budgetAtCompletion must be a non-negative number or null." }, { status: 400 });
    }
    await database.sql`UPDATE projects SET budget_at_completion = ${bac} WHERE id = ${projectId}`;
    return json({ ok: true });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const description = (body?.description || "").trim();
    const amount = body?.amount;
    if (!projectId || !description || typeof amount !== "number" || amount <= 0) {
      return json({ error: "projectId, description, and a positive amount are required." }, { status: 400 });
    }
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [costEntry] = await database.sql`
      INSERT INTO cost_entries (project_id, description, amount, incurred_date)
      VALUES (${projectId}, ${description}, ${amount}, ${body?.incurredDate || new Date().toISOString().slice(0, 10)})
      RETURNING id, description, amount, incurred_date, created_at
    `;
    return json({ costEntry }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/budget" };
