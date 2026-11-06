import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// The daily "what needs me right now" view: blocked tasks, tasks nobody has
// touched in a while, decisions still waiting on a stakeholder, and the
// highest-exposure open issues and risks. Nothing here is a new record --
// it's all a read-only lens on data that already exists elsewhere.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [blockedTasks, staleTasks, awaitingDecisions, urgentIssues, urgentRisks, taskCountRows, overdueTasks, datedTaskCountRows, stakeholderCountRows, lastCheckInRows] = await Promise.all([
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
      SELECT dr.id, dr.title, dr.created_at, dr.deadline, dr.public_token,
        COALESCE(json_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '[]'::json) AS recipients
      FROM decision_requests dr
      LEFT JOIN decision_request_recipients drr ON drr.decision_request_id = dr.id
      LEFT JOIN stakeholders s ON s.id = drr.stakeholder_id
      WHERE dr.project_id = ${projectId} AND dr.status = 'open' AND dr.deleted_at IS NULL
      GROUP BY dr.id
      ORDER BY dr.created_at ASC
    `,
    database.sql`
      SELECT id, title, severity, owner_name, status
      FROM issues
      WHERE project_id = ${projectId} AND status != 'resolved' AND severity IN ('high','critical') AND deleted_at IS NULL
      ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END
    `,
    database.sql`
      SELECT id, title, probability, impact, owner_name, status
      FROM risks
      WHERE project_id = ${projectId} AND status = 'open' AND (probability = 'high' OR impact = 'high') AND deleted_at IS NULL
      ORDER BY created_at ASC
    `,
    database.sql`
      SELECT count(*)::int AS count
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    // v150: the fields the project home's Next Step card reasons over.
    database.sql`
      SELECT id, title, due_date
      FROM tasks
      WHERE project_id = ${projectId} AND status != 'done' AND deleted_at IS NULL
        AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      ORDER BY due_date ASC
    `,
    database.sql`
      SELECT count(*)::int AS count
      FROM tasks WHERE project_id = ${projectId} AND deleted_at IS NULL AND due_date IS NOT NULL
    `,
    database.sql`
      SELECT count(*)::int AS count
      FROM stakeholders WHERE project_id = ${projectId} AND deleted_at IS NULL
    `,
    database.sql`
      SELECT max(created_at) AS last_check_in_at
      FROM status_updates WHERE project_id = ${projectId}
    `,
  ]);

  const taskCount = taskCountRows[0]?.count ?? 0;
  const datedTaskCount = datedTaskCountRows[0]?.count ?? 0;
  const stakeholderCount = stakeholderCountRows[0]?.count ?? 0;
  const lastCheckInAt = lastCheckInRows[0]?.last_check_in_at ?? null;

  return json({ blockedTasks, staleTasks, awaitingDecisions, urgentIssues, urgentRisks, taskCount, overdueTasks, datedTaskCount, stakeholderCount, lastCheckInAt });
});

export const config: Config = { path: "/api/today" };
