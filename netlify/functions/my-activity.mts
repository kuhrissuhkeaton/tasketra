import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// "My activity": the signed-in user's own actions across their projects, newest
// first. Only projects they still own or belong to are included. Entries from
// before authors were tracked have no author and never appear here.
export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const rows = await database.sql`
    SELECT a.id, a.project_id, p.name AS project_name, a.entity_type, a.entity_title, a.action, a.summary, a.created_at
    FROM activity_log a
    JOIN projects p ON p.id = a.project_id
    WHERE a.actor_id = ${userId}
      AND (
        p.owner_id = ${userId}
        OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${userId} AND m.status = 'active')
      )
    ORDER BY a.created_at DESC
    LIMIT 200
  `;
  return json({
    items: rows.map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      entityType: r.entity_type,
      entityTitle: r.entity_title,
      action: r.action,
      summary: r.summary,
      createdAt: r.created_at,
    })),
  });
});

export const config: Config = { path: "/api/my-activity" };
