import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";

const VALID_DIRECTIONS = ["internal", "external"];
const VALID_STATUSES = ["blocked", "in_progress", "resolved"];
const DEPENDENCY_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "direction", label: "direction" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
  { key: "needed_by", label: "needed by" },
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

    const dependencies = await database.sql`
      SELECT id, title, description, direction, status, owner_name, needed_by, created_at, updated_at, resolved_at
      FROM dependencies WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        needed_by ASC NULLS LAST, created_at DESC
    `;
    return json({ dependencies });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const direction = VALID_DIRECTIONS.includes(body?.direction) ? body.direction : "internal";

    const [dependency] = await database.sql`
      INSERT INTO dependencies (project_id, title, description, direction, owner_name, needed_by)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${direction}, ${body?.ownerName || null}, ${body?.neededBy || null})
      RETURNING id, title, description, direction, status, owner_name, needed_by, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "dependency", entityId: dependency.id, entityTitle: dependency.title, action: "created" });
    return json({ dependency }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM dependencies WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE dependencies SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "dependency", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.direction && !VALID_DIRECTIONS.includes(body.direction)) {
      return json({ error: "Invalid direction." }, { status: 400 });
    }

    const [dependency] = await database.sql`
      UPDATE dependencies SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        direction = COALESCE(${body.direction ?? null}, direction),
        status = COALESCE(${body.status ?? null}, status),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        needed_by = COALESCE(${body.neededBy ?? null}, needed_by),
        resolved_at = CASE WHEN ${body.status ?? null} = 'resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, direction, status, owner_name, needed_by, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, direction: body.direction,
      status: body.status, owner_name: body.ownerName, needed_by: body.neededBy,
    }, DEPENDENCY_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "dependency", entityId: id, entityTitle: dependency.title, action: "updated", summary });

    return json({ dependency });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM dependencies WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE dependencies SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "dependency", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/dependencies" };
