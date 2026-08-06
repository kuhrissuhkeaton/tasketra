import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const database = db();
  const feed = await database.sql`
    SELECT 'status_update' AS type, NULL AS title, body, created_at AS ts,
      '{}'::jsonb AS meta
    FROM status_updates WHERE project_id = ${projectId}

    UNION ALL

    SELECT 'task' AS type, title, status AS body, updated_at AS ts,
      jsonb_build_object('status', status, 'dueDate', due_date) AS meta
    FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'decision_request' AS type, title, context AS body, created_at AS ts,
      jsonb_build_object('status', status, 'token', public_token) AS meta
    FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'decision_record' AS type, dr.title AS title,
      (rec.chosen_option || ' -- ' || rec.responder_name) AS body, rec.responded_at AS ts,
      jsonb_build_object('chosenOption', rec.chosen_option, 'responderName', rec.responder_name) AS meta
    FROM decision_records rec
    JOIN decision_requests dr ON dr.id = rec.decision_request_id
    WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL

    UNION ALL

    SELECT 'issue' AS type, title, status AS body, updated_at AS ts,
      jsonb_build_object('severity', severity, 'status', status) AS meta
    FROM issues WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'risk' AS type, title, status AS body, updated_at AS ts,
      jsonb_build_object('probability', probability, 'impact', impact, 'status', status) AS meta
    FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'activity' AS type, entity_title AS title, summary AS body, created_at AS ts,
      jsonb_build_object('entityType', entity_type, 'action', action) AS meta
    FROM activity_log WHERE project_id = ${projectId}

    ORDER BY ts DESC
    LIMIT 200
  `;

  return json({ feed });
};

export const config: Config = { path: "/api/feed" };
