import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess, isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";
import { computeVariance, snapshotTasks, type BaselineTask } from "../lib/baseline.ts";

// The project baseline: lock it once the plan is agreed, then see what has
// moved. Only the owner can lock or re-lock; anyone with access can read.
// Locking never blocks edits -- it records the plan so drift is visible.

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function readBaseline(database: ReturnType<typeof db>, projectId: string) {
  const [[project], taskRows, baselines] = await Promise.all([
    database.sql`SELECT budget_at_completion, contingency_reserve FROM projects WHERE id = ${projectId}`,
    database.sql`
      SELECT id, title, start_date, due_date FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC
    `,
    database.sql`
      SELECT b.id, b.locked_at, b.budget_at_completion, b.contingency_reserve, b.tasks, u.email AS locked_by_email
      FROM project_baselines b LEFT JOIN users u ON u.id = b.locked_by
      WHERE b.project_id = ${projectId} ORDER BY b.locked_at DESC, b.id DESC
    `,
  ]);

  const currentTasks = snapshotTasks(taskRows as any);
  const current = {
    budget: num(project?.budget_at_completion),
    reserve: num(project?.contingency_reserve),
    tasks: currentTasks,
  };
  const latest = baselines[0] as any;
  const base = {
    current: {
      taskCount: currentTasks.length,
      datedTaskCount: currentTasks.filter((t) => t.start || t.due).length,
      budget: current.budget,
      reserve: current.reserve,
    },
    history: baselines.map((b: any) => ({ id: b.id, lockedAt: b.locked_at })),
  };
  if (!latest) return { ...base, baseline: null, variance: null };

  const snapshot: BaselineTask[] = Array.isArray(latest.tasks) ? latest.tasks : [];
  return {
    ...base,
    baseline: {
      id: latest.id,
      lockedAt: latest.locked_at,
      lockedByEmail: latest.locked_by_email ?? null,
      budget: num(latest.budget_at_completion),
      reserve: num(latest.contingency_reserve),
      taskCount: snapshot.length,
      datedTaskCount: snapshot.filter((t) => t.start || t.due).length,
    },
    variance: computeVariance({ budget: num(latest.budget_at_completion), reserve: num(latest.contingency_reserve), tasks: snapshot }, current),
  };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    return json(await readBaseline(database, projectId));
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [project] = await database.sql`SELECT name, budget_at_completion, contingency_reserve FROM projects WHERE id = ${projectId}`;
    if (!project) return json({ error: "Not found" }, { status: 404 });
    const [{ n: existing }] = await database.sql`SELECT count(*)::int AS n FROM project_baselines WHERE project_id = ${projectId}`;
    const taskRows = await database.sql`
      SELECT id, title, start_date, due_date FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at ASC
    `;
    const [locked] = await database.sql`
      INSERT INTO project_baselines (project_id, locked_by, budget_at_completion, contingency_reserve, tasks)
      VALUES (${projectId}, ${userId}, ${project.budget_at_completion}, ${project.contingency_reserve}, ${JSON.stringify(snapshotTasks(taskRows as any))}::jsonb)
      RETURNING id
    `;
    await logActivity(database, {
      projectId, entityType: "project", entityId: locked.id, entityTitle: project.name, action: "updated",
      summary: existing > 0 ? "baseline re-locked" : "baseline locked",
    });
    return json(await readBaseline(database, projectId), { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/baseline" };
