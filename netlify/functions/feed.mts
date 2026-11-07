import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const database = db();
  const feed = await database.sql`
    SELECT 'status_update' AS type, NULL AS title, body, created_at AS ts,
      '{}'::jsonb AS meta, health
    FROM status_updates WHERE project_id = ${projectId}

    UNION ALL

    SELECT 'task' AS type, title,
      CASE status WHEN 'not_started' THEN 'Not started' WHEN 'in_progress' THEN 'In progress'
        WHEN 'blocked' THEN 'Blocked' WHEN 'done' THEN 'Done' ELSE status END AS body, updated_at AS ts,
      jsonb_build_object('status', status, 'dueDate', due_date) AS meta, NULL AS health
    FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'decision_request' AS type, title, context AS body, created_at AS ts,
      jsonb_build_object('status', status, 'token', public_token) AS meta, NULL AS health
    FROM decision_requests WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'decision_record' AS type, dr.title AS title,
      (rec.chosen_option || ' · ' || rec.responder_name) AS body, rec.responded_at AS ts,
      jsonb_build_object('chosenOption', rec.chosen_option, 'responderName', rec.responder_name) AS meta, NULL AS health
    FROM decision_records rec
    JOIN decision_requests dr ON dr.id = rec.decision_request_id
    WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL

    UNION ALL

    SELECT 'issue' AS type, title,
      CASE status WHEN 'open' THEN 'Open' WHEN 'in_progress' THEN 'In progress'
        WHEN 'resolved' THEN 'Resolved' ELSE status END AS body, updated_at AS ts,
      jsonb_build_object('severity', severity, 'status', status) AS meta, NULL AS health
    FROM issues WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'risk' AS type, title,
      CASE status WHEN 'open' THEN 'Open' WHEN 'monitoring' THEN 'Monitoring'
        WHEN 'resolved' THEN 'Resolved' ELSE status END AS body, updated_at AS ts,
      jsonb_build_object('probability', probability, 'impact', impact, 'status', status) AS meta, NULL AS health
    FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL

    UNION ALL

    SELECT 'activity' AS type, a.entity_title AS title, a.summary AS body, a.created_at AS ts,
      jsonb_build_object('entityType', a.entity_type, 'action', a.action, 'actorId', a.actor_id,
        'actorName', CASE WHEN a.actor_id IS NULL THEN NULL
          ELSE COALESCE(NULLIF(TRIM(u.display_name), ''), 'a teammate') END) AS meta, NULL AS health
    FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.project_id = ${projectId}
      -- v150/v150.1: creations of the entities that have their own derived
      -- branch above (decisions, tasks, issues, risks) already arrive via
      -- that branch; the activity copy of the same event showed every new
      -- decision twice ("DECISION REQUESTED" + "DECISION CREATED"), and the
      -- same for tasks, issues and risks. Creations of everything else
      -- (stakeholders, roadmap items, documents...) have no derived branch
      -- and keep their activity row.
      AND NOT (a.action = 'created' AND a.entity_type IN ('decision', 'task', 'issue', 'risk'))
      -- v151 (Part C2): updates of tasks, issues and risks double the same
      -- way -- the derived branch re-surfaces the entity at its updated_at
      -- carrying its new status, so the activity "updated" row is the copy.
      -- (The diff text still lives in My activity.) Decisions are NOT in
      -- this list: a decision confirm is an 'updated' activity row and the
      -- derived decision_request row stays at its created_at, so the
      -- activity row is the only feed trace of the confirmation.
      AND NOT (a.action = 'updated' AND a.entity_type IN ('task', 'issue', 'risk'))
      -- v151 (Part C3): check-ins write an activity row now (for My
      -- activity); the derived status_update branch above already carries
      -- them here, so the activity copy would double every check-in.
      AND NOT (a.action = 'created' AND a.entity_type = 'status_update')

    ORDER BY ts DESC
    LIMIT 200
  `;

  return json({ feed });
});

export const config: Config = { path: "/api/feed" };
