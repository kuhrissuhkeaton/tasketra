import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// A lightweight quality log -- standards to meet, reviews to run, defects
// found -- kept as its own RAID-style entity rather than folded into Issues,
// since "is this good enough" is a different question from "is something
// broken," even though the tracking shape (title, owner, status) is the same.

const VALID_CATEGORIES = ["standard", "review", "defect"];
const VALID_STATUSES = ["open", "in_progress", "passed", "failed"];
const QUALITY_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "category", label: "category" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
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

    const qualityItems = await database.sql`
      SELECT id, title, description, category, status, owner_name, created_at, updated_at, resolved_at
      FROM quality_items WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'failed' THEN 0 WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
        created_at DESC
    `;
    return json({ qualityItems });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "review";
    if (body?.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "open";
    const resolvedAt = status === "passed" || status === "failed" ? new Date() : null;

    const [qualityItem] = await database.sql`
      INSERT INTO quality_items (project_id, title, description, category, owner_name, status, resolved_at)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${category}, ${body?.ownerName || null}, ${status}, ${resolvedAt})
      RETURNING id, title, description, category, status, owner_name, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "quality_item", entityId: qualityItem.id, entityTitle: qualityItem.title, action: "created" });
    return json({ qualityItem }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM quality_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE quality_items SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "quality_item", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return json({ error: "Invalid category." }, { status: 400 });
    }

    const [qualityItem] = await database.sql`
      UPDATE quality_items SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        category = COALESCE(${body.category ?? null}, category),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        status = COALESCE(${body.status ?? null}, status),
        resolved_at = CASE WHEN ${body.status ?? null} IN ('passed','failed') THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, category, status, owner_name, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, category: body.category,
      owner_name: body.ownerName, status: body.status,
    }, QUALITY_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "quality_item", entityId: id, entityTitle: qualityItem.title, action: "updated", summary });

    return json({ qualityItem });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM quality_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE quality_items SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "quality_item", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/quality" };
