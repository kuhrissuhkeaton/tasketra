import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// Roadmap items are a standalone entity, independent of Tasks -- see the
// migration comment for why. Ordering is derived from dates (this is a
// timeline view, not a manually-sorted list): swimlane, then start_date
// (undated items last within their swimlane), then created_at as a
// tiebreaker so item order doesn't shuffle between loads.

const VALID_TYPES = ["phase", "milestone", "release", "event", "note"];
const VALID_STATUSES = ["not_started", "in_progress", "blocked", "done"];
const ROADMAP_FIELDS = [
  { key: "title", label: "title" },
  { key: "type", label: "type" },
  { key: "swimlane", label: "swimlane" },
  { key: "start_date", label: "start date" },
  { key: "end_date", label: "end date" },
  { key: "status", label: "status" },
];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const items = await database.sql`
      SELECT id, type, title, description, swimlane, start_date, end_date, status, created_by, created_at, updated_at
      FROM roadmap_items
      WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY swimlane ASC, start_date ASC NULLS LAST, created_at ASC
    `;
    return json({ items });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const type = VALID_TYPES.includes(body?.type) ? body.type : "milestone";
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "not_started";
    const swimlane = (body?.swimlane || "").trim() || "General";

    const [item] = await database.sql`
      INSERT INTO roadmap_items (project_id, type, title, description, swimlane, start_date, end_date, status, created_by)
      VALUES (
        ${projectId}, ${type}, ${title}, ${body?.description || null}, ${swimlane},
        ${body?.startDate || null}, ${body?.endDate || null}, ${status}, ${userId}
      )
      RETURNING id, type, title, description, swimlane, start_date, end_date, status, created_by, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "roadmap_item", entityId: item.id, entityTitle: item.title, action: "created" });
    return json({ item }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM roadmap_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE roadmap_items SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "roadmap_item", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
      return json({ error: "Invalid item type." }, { status: 400 });
    }
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    const hasStartDate = "startDate" in body;
    const hasEndDate = "endDate" in body;
    const hasDescription = "description" in body;

    const [item] = await database.sql`
      UPDATE roadmap_items SET
        title = COALESCE(${body.title?.trim() || null}, title),
        type = COALESCE(${body.type ?? null}, type),
        swimlane = COALESCE(${body.swimlane?.trim() || null}, swimlane),
        status = COALESCE(${body.status ?? null}, status),
        description = CASE WHEN ${hasDescription} THEN ${hasDescription ? (body.description || null) : null} ELSE description END,
        start_date = CASE WHEN ${hasStartDate} THEN ${hasStartDate ? (body.startDate || null) : null} ELSE start_date END,
        end_date = CASE WHEN ${hasEndDate} THEN ${hasEndDate ? (body.endDate || null) : null} ELSE end_date END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, type, title, description, swimlane, start_date, end_date, status, created_by, created_at, updated_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, type: body.type, swimlane: body.swimlane,
      start_date: hasStartDate ? body.startDate : undefined,
      end_date: hasEndDate ? body.endDate : undefined,
      status: body.status,
    }, ROADMAP_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "roadmap_item", entityId: id, entityTitle: item.title, action: "updated", summary });

    return json({ item });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM roadmap_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE roadmap_items SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "roadmap_item", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/roadmap" };
