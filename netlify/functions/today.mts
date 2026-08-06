import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";

// The daily "what needs me right now" view: blocked tasks, tasks nobody has
// touched in a while, decisions still waiting on a stakeholder, and the
// highest-exposure open issues and risks. Nothing here is a new record --
// it's all a read-only lens on data that already exists elsewhere.

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [blockedTasks, staleTasks, awaitingDecisions, urgentIssues, urgentRisks, taskCountRows] = await Promise.all([
    database.sql`
      SELECT id, title, owner_name, due_date, updated_at
      FROM tasks WHERE project_id = ${projectId} AND status = 'blocked' AND deleted_at IS NULL
      ORDER BY updated_at ASC
    `,
    database.sql`
      SELECT id, title, status, owner_name, updated_at
      FROM tasks
      WHERE project_id = ${projectId} AND status IN ('not_started','in_progress') AND deleted_at IS NULL
        AND updated_at < now() - interval '3 days'
      ORDER BY updated_at ASC
    `,
    database.sql`
      SELECT dr.id, dr.title, dr.created_at, dr.deadline,
        COALESCE(json_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '[]'::json) AS recipients
      FROM decision_requests dr
      LEFT JOIN decision_request_recipients drr ON drr.decision_request_id = dr.id
      LEFT JOIN stakeholders s ON s.id = drr.stakeholder_id
      WHERE dr.project_id = ${projectId} AND dr.status = 'open' AND dr.deleted_at IS NULL
      GROUP BY dr.id
      ORDER BY dr.created_at ASC
    `,
    database.sql`
      SELECT id, title, severity, owner_name
      FROM issues
      WHERE project_id = ${projectId} AND status != 'resolved' AND severity IN ('high','critical') AND deleted_at IS NULL
      ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END
    `,
    database.sql`
      SELECT id, title, probability, impact, owner_name
      FROM risks
      WHERE project_id = ${projectId} AND status = 'open' AND (probability = 'high' OR impact = 'high') AND deleted_at IS NULL
      ORDER BY created_at ASC
    `,
    database.sql`
      SELECT count(*)::int AS count
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
  ]);

  const taskCount = taskCountRows[0]?.count ?? 0;

  return json({ blockedTasks, staleTasks, awaitingDecisions, urgentIssues, urgentRisks, taskCount });
};

export const config: Config = { path: "/api/today" };
