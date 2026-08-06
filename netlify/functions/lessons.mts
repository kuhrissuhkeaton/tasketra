import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";

const VALID_CATEGORIES = ["went_well", "went_poorly", "action_item"];
const VALID_STATUSES = ["open", "done"];
const LESSON_FIELDS = [
  { key: "category", label: "category" },
  { key: "summary", label: "summary" },
  { key: "details", label: "details" },
  { key: "owner_name", label: "owner" },
  { key: "status", label: "status" },
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

    const lessons = await database.sql`
      SELECT id, category, summary, details, owner_name, status, created_at, updated_at
      FROM lessons_learned WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE category WHEN 'action_item' THEN 0 WHEN 'went_poorly' THEN 1 ELSE 2 END,
        created_at DESC
    `;
    return json({ lessons });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const summary = (body?.summary || "").trim();
    if (!projectId || !summary) return json({ error: "projectId and summary are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "went_well";

    const [lesson] = await database.sql`
      INSERT INTO lessons_learned (project_id, category, summary, details, owner_name)
      VALUES (${projectId}, ${category}, ${summary}, ${body?.details || null}, ${body?.ownerName || null})
      RETURNING id, category, summary, details, owner_name, status, created_at, updated_at
    `;
    await logActivity(database, { projectId, entityType: "lesson", entityId: lesson.id, entityTitle: lesson.summary, action: "created" });
    return json({ lesson }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM lessons_learned WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE lessons_learned SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "lesson", entityId: id, entityTitle: existing.summary, action: "restored" });
      return json({ ok: true });
    }

    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return json({ error: "Invalid category." }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    const [lesson] = await database.sql`
      UPDATE lessons_learned SET
        category = COALESCE(${body.category ?? null}, category),
        summary = COALESCE(${body.summary ?? null}, summary),
        details = COALESCE(${body.details ?? null}, details),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        status = COALESCE(${body.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, category, summary, details, owner_name, status, created_at, updated_at
    `;

    const summaryText = diffSummary(existing, {
      category: body.category, summary: body.summary, details: body.details,
      owner_name: body.ownerName, status: body.status,
    }, LESSON_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "lesson", entityId: id, entityTitle: lesson.summary, action: "updated", summary: summaryText });

    return json({ lesson });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, summary FROM lessons_learned WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE lessons_learned SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "lesson", entityId: id, entityTitle: existing.summary, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/lessons" };
