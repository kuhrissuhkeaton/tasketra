import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// A single, unified trash can across every soft-deletable entity type, so
// there's one place to go looking for anything you deleted -- restoring an
// item just calls back to that entity's own PATCH { restore: true }.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const items = await database.sql`
    SELECT 'task' AS entity_type, id, title, deleted_at FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'issue' AS entity_type, id, title, deleted_at FROM issues WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'risk' AS entity_type, id, title, deleted_at FROM risks WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'stakeholder' AS entity_type, id, name AS title, deleted_at FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'decision' AS entity_type, id, title, deleted_at FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'assumption' AS entity_type, id, statement AS title, deleted_at FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'dependency' AS entity_type, id, title, deleted_at FROM dependencies WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'change_request' AS entity_type, id, title, deleted_at FROM change_requests WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'lesson' AS entity_type, id, summary AS title, deleted_at FROM lessons_learned WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'meeting' AS entity_type, id, title, deleted_at FROM meetings WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    UNION ALL
    SELECT 'document' AS entity_type, id, filename AS title, deleted_at FROM documents WHERE project_id = ${projectId} AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `;

  return json({ items });
});

export const config: Config = { path: "/api/trash" };
