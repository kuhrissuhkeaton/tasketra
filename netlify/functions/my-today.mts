import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// Read-only. The one call the Today screen needs: the open tasks across every
// project the signed-in user can see (owned, or an active member of -- the
// same access rule /api/portfolio and /api/projects already use), plus the
// tasks finished in the last two days so the screen can say how many were
// closed today in the viewer's own timezone.
//
// No state lives here and nothing is written. Bucketing (overdue, today,
// this week) happens in the browser, against the viewer's local date, so a
// server in another timezone can't disagree with what the viewer sees.
//
// Parent tasks that have live sub-tasks are left out, matching the leaf rule
// /api/portfolio uses for its counts: the sub-tasks are the real work.
// Capped so a very large account can't return an unbounded list.

const OPEN_LIMIT = 400;
const DONE_LIMIT = 100;

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();

  const [openTasks, recentlyDone] = await Promise.all([
    database.sql`
      SELECT t.id, t.title, t.status, t.owner_name, t.due_date, t.project_id,
             p.name AS project_name, p.stage AS project_stage
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.status != 'done'
        AND p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
        AND t.id NOT IN (SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL)
      ORDER BY t.due_date NULLS LAST, t.created_at
      LIMIT ${OPEN_LIMIT}
    `,
    database.sql`
      SELECT t.id, t.updated_at
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.deleted_at IS NULL
        AND t.status = 'done'
        AND t.updated_at >= now() - interval '2 days'
        AND p.archived = false
        AND (p.owner_id = ${userId}
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userId} AND pm.status = 'active'))
      ORDER BY t.updated_at DESC
      LIMIT ${DONE_LIMIT}
    `,
  ]);

  return json({
    tasks: (openTasks as any[]).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      owner_name: t.owner_name,
      due_date: t.due_date ? String(t.due_date).slice(0, 10) : null,
      project_id: t.project_id,
      project_name: t.project_name,
      project_stage: t.project_stage,
    })),
    recentlyDone: (recentlyDone as any[]).map((t) => ({ id: t.id, updated_at: t.updated_at })),
    truncated: (openTasks as any[]).length >= OPEN_LIMIT,
  });
});

export const config: Config = { path: "/api/my-today" };
