import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";

const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_STATUSES = ["open", "in_progress", "resolved"];
const ISSUE_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "severity", label: "severity" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
  { key: "resolution", label: "resolution" },
];

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const issues = await database.sql`
      SELECT id, title, description, severity, status, owner_name, resolution, created_at, updated_at, resolved_at
      FROM issues WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC
    `;
    return json({ issues });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const severity = VALID_SEVERITIES.includes(body?.severity) ? body.severity : "medium";

    const [issue] = await database.sql`
      INSERT INTO issues (project_id, title, description, severity, owner_name)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${severity}, ${body?.ownerName || null})
      RETURNING id, title, description, severity, status, owner_name, resolution, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "issue", entityId: issue.id, entityTitle: issue.title, action: "created" });
    return json({ issue }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM issues WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE issues SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "issue", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return json({ error: "Invalid severity." }, { status: 400 });
    }

    const [issue] = await database.sql`
      UPDATE issues SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        severity = COALESCE(${body.severity ?? null}, severity),
        status = COALESCE(${body.status ?? null}, status),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        resolution = COALESCE(${body.resolution ?? null}, resolution),
        resolved_at = CASE WHEN ${body.status ?? null} = 'resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, severity, status, owner_name, resolution, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, severity: body.severity,
      status: body.status, owner_name: body.ownerName, resolution: body.resolution,
    }, ISSUE_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "issue", entityId: id, entityTitle: issue.title, action: "updated", summary });

    return json({ issue });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM issues WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE issues SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "issue", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/issues" };
