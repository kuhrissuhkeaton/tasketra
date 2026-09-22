import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// Links a Risk or an Issue to the task(s) it blocks -- two dedicated join
// tables under the hood (risk_task_links / issue_task_links, see the
// 20260922000000 migration), presented here as one small REST resource so
// the frontend doesn't need to know there are two tables. "sourceType" picks
// which one a given request means.
const VALID_SOURCE_TYPES = ["risk", "issue"] as const;
type SourceType = (typeof VALID_SOURCE_TYPES)[number];

function isUniqueViolation(err: unknown): boolean {
  // The driver (waddler, over node-postgres) wraps the raw pg error in its
  // own error class -- the Postgres error code lands on either the error
  // itself or its `.cause`, depending on the driver version, so check both
  // rather than assuming one shape.
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

    // Fetched whole (like tasks/risks/issues themselves) and filtered
    // client-side, rather than a per-item endpoint -- same pattern the rest
    // of the app already uses for project-scoped lists.
    const riskLinks = await database.sql`
      SELECT rtl.id, rtl.risk_id, rtl.task_id, r.title AS risk_title, t.title AS task_title
      FROM risk_task_links rtl
      JOIN risks r ON r.id = rtl.risk_id
      JOIN tasks t ON t.id = rtl.task_id
      WHERE r.project_id = ${projectId} AND r.deleted_at IS NULL AND t.deleted_at IS NULL
      ORDER BY rtl.created_at
    `;
    const issueLinks = await database.sql`
      SELECT itl.id, itl.issue_id, itl.task_id, i.title AS issue_title, t.title AS task_title
      FROM issue_task_links itl
      JOIN issues i ON i.id = itl.issue_id
      JOIN tasks t ON t.id = itl.task_id
      WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL AND t.deleted_at IS NULL
      ORDER BY itl.created_at
    `;
    return json({ riskLinks, issueLinks });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const sourceType = body?.sourceType as SourceType;
    const sourceId = body?.sourceId;
    const taskId = body?.taskId;
    if (!projectId || !sourceId || !taskId) {
      return json({ error: "projectId, sourceId, and taskId are required." }, { status: 400 });
    }
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
      return json({ error: "sourceType must be 'risk' or 'issue'." }, { status: 400 });
    }
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    // Both ends must belong to the same project the caller has access to --
    // otherwise a link could be used to probe or connect another project's
    // data.
    const [task] = await database.sql`SELECT id, title, project_id FROM tasks WHERE id = ${taskId} AND deleted_at IS NULL`;
    if (!task || task.project_id !== projectId) {
      return json({ error: "Task not found in this project." }, { status: 400 });
    }

    if (sourceType === "risk") {
      const [risk] = await database.sql`SELECT id, title, project_id FROM risks WHERE id = ${sourceId} AND deleted_at IS NULL`;
      if (!risk || risk.project_id !== projectId) {
        return json({ error: "Risk not found in this project." }, { status: 400 });
      }
      try {
        const [link] = await database.sql`
          INSERT INTO risk_task_links (risk_id, task_id) VALUES (${sourceId}, ${taskId})
          RETURNING id, risk_id, task_id
        `;
        await logActivity(database, {
          projectId, entityType: "risk", entityId: risk.id, entityTitle: risk.title,
          action: "updated", summary: `Linked to task "${task.title}"`,
        });
        return json({ link: { ...link, risk_title: risk.title, task_title: task.title } }, { status: 201 });
      } catch (err) {
        if (isUniqueViolation(err)) {
          const [existing] = await database.sql`SELECT id, risk_id, task_id FROM risk_task_links WHERE risk_id = ${sourceId} AND task_id = ${taskId}`;
          return json({ link: { ...existing, risk_title: risk.title, task_title: task.title } }, { status: 200 });
        }
        throw err;
      }
    }

    const [issue] = await database.sql`SELECT id, title, project_id FROM issues WHERE id = ${sourceId} AND deleted_at IS NULL`;
    if (!issue || issue.project_id !== projectId) {
      return json({ error: "Issue not found in this project." }, { status: 400 });
    }
    try {
      const [link] = await database.sql`
        INSERT INTO issue_task_links (issue_id, task_id) VALUES (${sourceId}, ${taskId})
        RETURNING id, issue_id, task_id
      `;
      await logActivity(database, {
        projectId, entityType: "issue", entityId: issue.id, entityTitle: issue.title,
        action: "updated", summary: `Linked to task "${task.title}"`,
      });
      return json({ link: { ...link, issue_title: issue.title, task_title: task.title } }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const [existing] = await database.sql`SELECT id, issue_id, task_id FROM issue_task_links WHERE issue_id = ${sourceId} AND task_id = ${taskId}`;
        return json({ link: { ...existing, issue_title: issue.title, task_title: task.title } }, { status: 200 });
      }
      throw err;
    }
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const sourceType = url.searchParams.get("sourceType") as SourceType;
    if (!id || !VALID_SOURCE_TYPES.includes(sourceType)) {
      return json({ error: "id and sourceType ('risk' or 'issue') are required." }, { status: 400 });
    }

    if (sourceType === "risk") {
      const [existing] = await database.sql`
        SELECT rtl.id, r.project_id, r.title AS risk_title, r.id AS risk_id, t.title AS task_title
        FROM risk_task_links rtl JOIN risks r ON r.id = rtl.risk_id JOIN tasks t ON t.id = rtl.task_id
        WHERE rtl.id = ${id}
      `;
      if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
        return json({ error: "Not found" }, { status: 404 });
      }
      await database.sql`DELETE FROM risk_task_links WHERE id = ${id}`;
      await logActivity(database, {
        projectId: existing.project_id, entityType: "risk", entityId: existing.risk_id, entityTitle: existing.risk_title,
        action: "updated", summary: `Unlinked from task "${existing.task_title}"`,
      });
      return json({ ok: true });
    }

    const [existing] = await database.sql`
      SELECT itl.id, i.project_id, i.title AS issue_title, i.id AS issue_id, t.title AS task_title
      FROM issue_task_links itl JOIN issues i ON i.id = itl.issue_id JOIN tasks t ON t.id = itl.task_id
      WHERE itl.id = ${id}
    `;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`DELETE FROM issue_task_links WHERE id = ${id}`;
    await logActivity(database, {
      projectId: existing.project_id, entityType: "issue", entityId: existing.issue_id, entityTitle: existing.issue_title,
      action: "updated", summary: `Unlinked from task "${existing.task_title}"`,
    });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/raid-task-links" };
