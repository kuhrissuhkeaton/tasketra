// Data behind the MCP server's read tools (v169). Every function takes the
// token owner's user id and applies the app's standard access rule — owner,
// or an active project member — exactly as /api/projects, /api/my-today and
// /api/weekly-sync do, so an AI connected over MCP can never see a project
// its owner couldn't see in the app. Queries are modeled on those endpoints
// and the numbers are read from the same tables the same way, so MCP
// answers match what the app shows.

import { buildSnapshot } from "./snapshotData.ts";
import { hasProjectAccess } from "./ownership.ts";

/** Date columns arrive as Date objects from the driver. Normalize to a
 *  YYYY-MM-DD key (same helper as snapshotData). */
function dateKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function daysSince(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const t = v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export class McpToolError extends Error {}

async function projectOrThrow(database: any, userId: string, projectId: unknown) {
  if (typeof projectId !== "string" || !projectId) {
    throw new McpToolError("project_id is required. Use list_projects to find the id.");
  }
  if (!(await hasProjectAccess(userId, projectId))) {
    throw new McpToolError("That project was not found among the projects this account can access.");
  }
  const [project] = await database.sql`SELECT id, name, stage FROM projects WHERE id = ${projectId}`;
  if (!project) throw new McpToolError("That project was not found among the projects this account can access.");
  return project;
}

export async function mcpListProjects(database: any, userId: string) {
  const projects = await database.sql`
    SELECT p.id, p.name, p.stage, p.created_at,
      (SELECT count(*)::int FROM decision_requests dr WHERE dr.project_id = p.id AND dr.status = 'open' AND dr.deleted_at IS NULL) AS open_decisions,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < now()::date AND t.deleted_at IS NULL) AS overdue_tasks
    FROM projects p
    WHERE p.archived = false
      AND (p.owner_id = ${userId}
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
    ORDER BY p.created_at DESC
  `;
  return {
    projects: (projects as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      stage: p.stage,
      open_decisions: p.open_decisions,
      overdue_tasks: p.overdue_tasks,
    })),
  };
}

export async function mcpGetProjectOverview(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const snapshot = await buildSnapshot(database, project.id);
  return { project: { id: project.id, name: project.name, stage: project.stage }, ...snapshot };
}

export async function mcpListTasks(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const status = args?.status ?? "open";
  if (status !== "open" && status !== "done" && status !== "all") {
    throw new McpToolError("status must be one of open, done, or all.");
  }
  const overdueOnly = args?.overdue_only === true;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await database.sql`
    SELECT id, title, status, due_date, owner_name, parent_task_id
    FROM tasks
    WHERE project_id = ${project.id} AND deleted_at IS NULL
    ORDER BY due_date NULLS LAST, created_at
  `;
  const tasks = (rows as any[])
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      due_date: dateKey(t.due_date),
      owner_name: t.owner_name,
      is_subtask: t.parent_task_id !== null && t.parent_task_id !== undefined,
      overdue: t.status !== "done" && dateKey(t.due_date) !== null && (dateKey(t.due_date) as string) < today,
    }))
    .filter((t) => (status === "all" ? true : status === "done" ? t.status === "done" : t.status !== "done"))
    .filter((t) => (overdueOnly ? t.overdue : true))
    .slice(0, 200);
  return { project: { id: project.id, name: project.name }, count: tasks.length, tasks };
}

export async function mcpGetDecisionsWaiting(database: any, userId: string) {
  const rows = await database.sql`
    SELECT dr.id, dr.title, dr.context, dr.deadline, dr.created_at,
           p.id AS project_id, p.name AS project_name, s.name AS owner_name
    FROM decision_requests dr
    JOIN projects p ON p.id = dr.project_id
    LEFT JOIN stakeholders s ON s.id = dr.owner_stakeholder_id
    WHERE dr.status = 'open' AND dr.deleted_at IS NULL AND p.archived = false
      AND (p.owner_id = ${userId}
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
    ORDER BY dr.deadline NULLS LAST, dr.created_at
    LIMIT 100
  `;
  return {
    decisions: (rows as any[]).map((d) => ({
      id: d.id,
      title: d.title,
      context: d.context,
      project: d.project_name,
      project_id: d.project_id,
      owner: d.owner_name,
      needed_by: dateKey(d.deadline),
      waiting_days: daysSince(d.created_at),
    })),
  };
}

export async function mcpListRisks(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const rows = await database.sql`
    SELECT id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status
    FROM risks
    WHERE project_id = ${project.id} AND deleted_at IS NULL AND status IN ('open', 'monitoring')
    ORDER BY
      (probability_score * impact_score) DESC NULLS LAST,
      CASE WHEN probability = 'high' AND impact = 'high' THEN 0
           WHEN probability = 'high' OR impact = 'high' THEN 1
           WHEN probability = 'medium' AND impact = 'medium' THEN 2
           ELSE 3 END,
      created_at DESC
    LIMIT 25
  `;
  return {
    project: { id: project.id, name: project.name },
    risks: (rows as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      exposure_score:
        r.probability_score !== null && r.impact_score !== null ? r.probability_score * r.impact_score : null,
      mitigation: r.mitigation,
      owner_name: r.owner_name,
      status: r.status,
    })),
  };
}

export async function mcpGetToday(database: any, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [openTasks, recentlyDone] = await Promise.all([
    database.sql`
      SELECT t.id, t.title, t.status, t.owner_name, t.due_date, t.project_id,
             p.name AS project_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.status != 'done'
        AND p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
      ORDER BY t.due_date NULLS LAST, t.created_at
      LIMIT 400
    `,
    database.sql`
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.status = 'done'
        AND t.updated_at >= now() - interval '2 days'
        AND p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      LIMIT 100
    `,
  ]);
  const shape = (t: any) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    owner_name: t.owner_name,
    due_date: dateKey(t.due_date),
    project: t.project_name,
    project_id: t.project_id,
  });
  const all = (openTasks as any[]).map(shape);
  return {
    today,
    overdue: all.filter((t) => t.due_date !== null && t.due_date < today),
    due_today: all.filter((t) => t.due_date === today),
    open_total: all.length,
    done_last_two_days: (recentlyDone as any[]).length,
  };
}

export async function mcpGetWeeklySync(database: any, userId: string, args: any) {
  const project = await projectOrThrow(database, userId, args?.project_id);
  const [[latestStatus], asks, overdueRows, [doneRow]] = await Promise.all([
    database.sql`
      SELECT body, health, created_at FROM status_updates
      WHERE project_id = ${project.id}
      ORDER BY created_at DESC LIMIT 1
    `,
    database.sql`
      SELECT dr.id, dr.title, dr.context, dr.deadline, dr.created_at, s.name AS owner_name
      FROM decision_requests dr
      LEFT JOIN stakeholders s ON s.id = dr.owner_stakeholder_id
      WHERE dr.project_id = ${project.id} AND dr.status = 'open' AND dr.deleted_at IS NULL
      ORDER BY dr.deadline NULLS LAST, dr.created_at
      LIMIT 50
    `,
    database.sql`
      SELECT id, title, due_date, owner_name FROM tasks
      WHERE project_id = ${project.id} AND deleted_at IS NULL AND status != 'done'
        AND due_date IS NOT NULL AND due_date < now()::date
        AND id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
      ORDER BY due_date
      LIMIT 25
    `,
    database.sql`
      SELECT count(*)::int AS done_count FROM tasks
      WHERE project_id = ${project.id} AND deleted_at IS NULL AND status = 'done'
        AND updated_at >= now() - interval '7 days'
    `,
  ]);
  return {
    project: { id: project.id, name: project.name, stage: project.stage },
    latest_check_in: latestStatus
      ? { health: latestStatus.health, note: latestStatus.body, at: dateKey(latestStatus.created_at) }
      : null,
    open_asks: (asks as any[]).map((a) => ({
      id: a.id,
      title: a.title,
      context: a.context,
      owner: a.owner_name,
      needed_by: dateKey(a.deadline),
      waiting_days: daysSince(a.created_at),
    })),
    overdue_tasks: (overdueRows as any[]).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: dateKey(t.due_date),
      owner_name: t.owner_name,
    })),
    done_last_7_days: doneRow?.done_count ?? 0,
  };
}
