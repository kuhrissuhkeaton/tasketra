import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { findDescendantIds } from "../lib/taskTree.ts";
import { withSentry } from "../lib/sentry.ts";

const VALID_STATUSES = ["not_started", "in_progress", "blocked", "done"];
const TASK_FIELDS = [
  { key: "title", label: "title" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
  { key: "start_date", label: "start" },
  { key: "due_date", label: "due" },
];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const tasks = await database.sql`
      SELECT id, title, status, owner_name, start_date, due_date, stakeholder_id, parent_task_id, created_at, updated_at
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END,
        due_date NULLS LAST
    `;
    return json({ tasks });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const parentTaskId = body?.parentTaskId || null;
    if (parentTaskId) {
      const [parent] = await database.sql`SELECT project_id FROM tasks WHERE id = ${parentTaskId}`;
      if (!parent || parent.project_id !== projectId) {
        return json({ error: "Parent task not found in this project." }, { status: 400 });
      }
    }

    const [task] = await database.sql`
      INSERT INTO tasks (project_id, title, owner_name, start_date, due_date, stakeholder_id, parent_task_id)
      VALUES (${projectId}, ${title}, ${body?.ownerName || null}, ${body?.startDate || null}, ${body?.dueDate || null}, ${body?.stakeholderId || null}, ${parentTaskId})
      RETURNING id, title, status, owner_name, start_date, due_date, stakeholder_id, parent_task_id, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "task", entityId: task.id, entityTitle: task.title, action: "created" });
    return json({ task }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM tasks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE tasks SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "task", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    if (body.parentTaskId) {
      if (body.parentTaskId === id) {
        return json({ error: "A task can't be its own sub-task." }, { status: 400 });
      }
      const [parent] = await database.sql`SELECT project_id FROM tasks WHERE id = ${body.parentTaskId}`;
      if (!parent || parent.project_id !== existing.project_id) {
        return json({ error: "Parent task not found in this project." }, { status: 400 });
      }
      // Cycle guard: the proposed new parent can't be a descendant of this task.
      // Algorithm (findDescendantIds) is unit tested in lib/__tests__/taskTree.test.ts.
      const allTasks = await database.sql`
        SELECT id, parent_task_id FROM tasks WHERE project_id = ${existing.project_id} AND deleted_at IS NULL
      ` as unknown as { id: string; parent_task_id: string | null }[];
      if (findDescendantIds(allTasks, id).has(body.parentTaskId)) {
        return json({ error: "Can't move a task under one of its own sub-tasks." }, { status: 400 });
      }
    }

    const [task] = await database.sql`
      UPDATE tasks SET
        title = COALESCE(${body.title ?? null}, title),
        status = COALESCE(${body.status ?? null}, status),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        start_date = COALESCE(${body.startDate ?? null}, start_date),
        due_date = COALESCE(${body.dueDate ?? null}, due_date),
        parent_task_id = COALESCE(${body.parentTaskId ?? null}, parent_task_id),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, status, owner_name, start_date, due_date, stakeholder_id, parent_task_id, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, status: body.status, owner_name: body.ownerName,
      start_date: body.startDate, due_date: body.dueDate,
    }, TASK_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "task", entityId: id, entityTitle: task.title, action: "updated", summary });

    return json({ task });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM tasks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    // Cascade: deleting a task hides its whole sub-tree, not just the one row.
    // This recursive CTE implements the same "walk down from id" contract as
    // findDescendantIds (lib/taskTree.ts, unit tested), kept as raw SQL here
    // since it's a single proven bulk UPDATE rather than a row-by-row loop.
    await database.sql`
      UPDATE tasks SET deleted_at = now()
      WHERE id = ${id} OR id IN (
        WITH RECURSIVE d AS (
          SELECT id FROM tasks WHERE parent_task_id = ${id}
          UNION ALL
          SELECT t.id FROM tasks t JOIN d ON t.parent_task_id = d.id
        )
        SELECT id FROM d
      )
    `;
    await logActivity(database, { projectId: existing.project_id, entityType: "task", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/tasks" };
