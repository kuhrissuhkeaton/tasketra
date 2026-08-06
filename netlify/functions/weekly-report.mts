import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// One-click weekly status report: everything that moved on a project in the
// last 7 days, plus a current-state snapshot. Pure aggregation, no new
// records -- built to be skimmed by a stakeholder in under a minute.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const [
    tasksCompleted,
    tasksAdded,
    issuesOpened,
    issuesResolved,
    risksOpened,
    risksResolved,
    decisionsMade,
    statusUpdates,
    snapshot,
  ] = await Promise.all([
    database.sql`
      SELECT id, title, owner_name, updated_at FROM tasks
      WHERE project_id = ${projectId} AND status = 'done' AND deleted_at IS NULL AND updated_at >= now() - interval '7 days'
      ORDER BY updated_at DESC
    `,
    database.sql`
      SELECT id, title, owner_name, due_date, status, created_at FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, severity, owner_name, created_at FROM issues
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, severity, resolution, resolved_at FROM issues
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at >= now() - interval '7 days'
      ORDER BY resolved_at DESC
    `,
    database.sql`
      SELECT id, title, probability, impact, owner_name, created_at FROM risks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT id, title, probability, impact, resolved_at FROM risks
      WHERE project_id = ${projectId} AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at >= now() - interval '7 days'
      ORDER BY resolved_at DESC
    `,
    database.sql`
      SELECT dr.id, dr.title, rec.chosen_option, rec.responder_name, rec.responded_at
      FROM decision_records rec
      JOIN decision_requests dr ON dr.id = rec.decision_request_id
      WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL AND rec.responded_at >= now() - interval '7 days'
      ORDER BY rec.responded_at DESC
    `,
    database.sql`
      SELECT id, body, created_at FROM status_updates
      WHERE project_id = ${projectId} AND created_at >= now() - interval '7 days'
      ORDER BY created_at DESC
    `,
    database.sql`
      SELECT
        (SELECT count(*) FROM tasks WHERE project_id = ${projectId} AND status != 'done' AND deleted_at IS NULL) AS open_tasks,
        (SELECT count(*) FROM tasks WHERE project_id = ${projectId} AND status = 'blocked' AND deleted_at IS NULL) AS blocked_tasks,
        (SELECT count(*) FROM issues WHERE project_id = ${projectId} AND status != 'resolved' AND deleted_at IS NULL) AS open_issues,
        (SELECT count(*) FROM issues WHERE project_id = ${projectId} AND status != 'resolved' AND severity IN ('high','critical') AND deleted_at IS NULL) AS urgent_issues,
        (SELECT count(*) FROM risks WHERE project_id = ${projectId} AND status != 'resolved' AND deleted_at IS NULL) AS open_risks,
        (SELECT count(*) FROM decision_requests WHERE project_id = ${projectId} AND status = 'open' AND deleted_at IS NULL) AS open_decisions
    `,
  ]);

  return json({
    rangeDays: 7,
    generatedAt: new Date().toISOString(),
    tasksCompleted,
    tasksAdded,
    issuesOpened,
    issuesResolved,
    risksOpened,
    risksResolved,
    decisionsMade,
    statusUpdates,
    snapshot: snapshot[0],
  });
});

export const config: Config = { path: "/api/weekly-report" };
