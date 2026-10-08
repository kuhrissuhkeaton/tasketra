import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// A simple task "depends on" task link -- see the 20261014000000 migration.
// Same idempotent-POST / dedicated-join-table shape as raid-task-links.mts,
// just between two tasks instead of a risk/issue and a task, so there's no
// sourceType to pick.
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return e.code === "23505" || e.cause?.code === "23505";
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    // Fetched whole and filtered client-side, same pattern as
    // raid-task-links.mts and the other project-scoped lists.
    const links = await database.sql`
      SELECT ttl.id, ttl.task_id, ttl.depends_on_task_id, t.title AS task_title, d.title AS depends_on_title
      FROM task_task_links ttl
      JOIN tasks t ON t.id = ttl.task_id
      JOIN tasks d ON d.id = ttl.depends_on_task_id
      WHERE t.project_id = ${projectId} AND t.deleted_at IS NULL AND d.deleted_at IS NULL
      ORDER BY ttl.created_at
    `;
    return json({ links });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const taskId = body?.taskId;
    const dependsOnTaskId = body?.dependsOnTaskId;
    if (!projectId || !taskId || !dependsOnTaskId) {
      return json({ error: "projectId, taskId, and dependsOnTaskId are required." }, { status: 400 });
    }
    if (taskId === dependsOnTaskId) {
      return json({ error: "A task can't depend on itself." }, { status: 400 });
    }
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    // Both ends must belong to the same project the caller has access to.
    const [task] = await database.sql`SELECT id, title, project_id FROM tasks WHERE id = ${taskId} AND deleted_at IS NULL`;
    if (!task || task.project_id !== projectId) {
      return json({ error: "Task not found in this project." }, { status: 400 });
    }
    const [dependsOn] = await database.sql`SELECT id, title, project_id FROM tasks WHERE id = ${dependsOnTaskId} AND deleted_at IS NULL`;
    if (!dependsOn || dependsOn.project_id !== projectId) {
      return json({ error: "Task not found in this project." }, { status: 400 });
    }

    try {
      const [link] = await database.sql`
        INSERT INTO task_task_links (task_id, depends_on_task_id) VALUES (${taskId}, ${dependsOnTaskId})
        RETURNING id, task_id, depends_on_task_id
      `;
      await logActivity(database, {
        projectId, entityType: "task", entityId: task.id, entityTitle: task.title,
        action: "updated", summary: `Marked as depending on "${dependsOn.title}"`,
      });
      return json({ link: { ...link, task_title: task.title, depends_on_title: dependsOn.title } }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const [existing] = await database.sql`SELECT id, task_id, depends_on_task_id FROM task_task_links WHERE task_id = ${taskId} AND depends_on_task_id = ${dependsOnTaskId}`;
        return json({ link: { ...existing, task_title: task.title, depends_on_title: dependsOn.title } }, { status: 200 });
      }
      throw err;
    }
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });

    const [existing] = await database.sql`
      SELECT ttl.id, t.project_id, t.title AS task_title, t.id AS task_id, d.title AS depends_on_title
      FROM task_task_links ttl JOIN tasks t ON t.id = ttl.task_id JOIN tasks d ON d.id = ttl.depends_on_task_id
      WHERE ttl.id = ${id}
    `;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`DELETE FROM task_task_links WHERE id = ${id}`;
    await logActivity(database, {
      projectId: existing.project_id, entityType: "task", entityId: existing.task_id, entityTitle: existing.task_title,
      action: "updated", summary: `No longer depends on "${existing.depends_on_title}"`,
    });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/task-dependencies" };
