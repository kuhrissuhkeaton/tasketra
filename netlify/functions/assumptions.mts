import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";

const VALID_STATUSES = ["unconfirmed", "confirmed", "invalidated"];
const ASSUMPTION_FIELDS = [
  { key: "statement", label: "statement" },
  { key: "notes", label: "notes" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
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

    const assumptions = await database.sql`
      SELECT id, statement, notes, status, owner_name, created_at, updated_at, validated_at
      FROM assumptions WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'unconfirmed' THEN 0 WHEN 'invalidated' THEN 1 ELSE 2 END,
        created_at DESC
    `;
    return json({ assumptions });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const statement = (body?.statement || "").trim();
    if (!projectId || !statement) return json({ error: "projectId and statement are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [assumption] = await database.sql`
      INSERT INTO assumptions (project_id, statement, notes, owner_name)
      VALUES (${projectId}, ${statement}, ${body?.notes || null}, ${body?.ownerName || null})
      RETURNING id, statement, notes, status, owner_name, created_at, updated_at, validated_at
    `;
    await logActivity(database, { projectId, entityType: "assumption", entityId: assumption.id, entityTitle: assumption.statement, action: "created" });
    return json({ assumption }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM assumptions WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE assumptions SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "assumption", entityId: id, entityTitle: existing.statement, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    const [assumption] = await database.sql`
      UPDATE assumptions SET
        statement = COALESCE(${body.statement ?? null}, statement),
        notes = COALESCE(${body.notes ?? null}, notes),
        status = COALESCE(${body.status ?? null}, status),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        validated_at = CASE WHEN ${body.status ?? null} IN ('confirmed','invalidated') THEN now() ELSE validated_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, statement, notes, status, owner_name, created_at, updated_at, validated_at
    `;

    const summary = diffSummary(existing, {
      statement: body.statement, notes: body.notes, status: body.status, owner_name: body.ownerName,
    }, ASSUMPTION_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "assumption", entityId: id, entityTitle: assumption.statement, action: "updated", summary });

    return json({ assumption });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, statement FROM assumptions WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE assumptions SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "assumption", entityId: id, entityTitle: existing.statement, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/assumptions" };
