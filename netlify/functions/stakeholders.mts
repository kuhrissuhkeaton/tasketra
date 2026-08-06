import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";

const STAKEHOLDER_FIELDS = [
  { key: "name", label: "name" },
  { key: "role", label: "role" },
  { key: "email", label: "email" },
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

    const stakeholders = await database.sql`
      SELECT s.id, s.name, s.email, s.role,
        (SELECT count(*)::int
           FROM decision_request_recipients r
           JOIN decision_requests dr ON dr.id = r.decision_request_id
           WHERE r.stakeholder_id = s.id AND dr.deleted_at IS NULL) AS decisions_sent,
        (SELECT count(*)::int
           FROM decision_request_recipients r
           JOIN decision_requests dr ON dr.id = r.decision_request_id
           WHERE r.stakeholder_id = s.id AND dr.status = 'resolved' AND dr.deleted_at IS NULL) AS decisions_resolved
      FROM stakeholders s
      WHERE s.project_id = ${projectId} AND s.deleted_at IS NULL
      ORDER BY s.created_at ASC
    `;
    return json({ stakeholders });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const name = (body?.name || "").trim();
    if (!projectId || !name) return json({ error: "projectId and name are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [stakeholder] = await database.sql`
      INSERT INTO stakeholders (project_id, name, email, role)
      VALUES (${projectId}, ${name}, ${body?.email || null}, ${body?.role || null})
      RETURNING id, name, email, role
    `;
    await logActivity(database, { projectId, entityType: "stakeholder", entityId: stakeholder.id, entityTitle: stakeholder.name, action: "created" });
    return json({ stakeholder }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM stakeholders WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE stakeholders SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: existing.name, action: "restored" });
      return json({ ok: true });
    }

    const [stakeholder] = await database.sql`
      UPDATE stakeholders SET
        name = COALESCE(${body.name ?? null}, name),
        role = COALESCE(${body.role ?? null}, role),
        email = COALESCE(${body.email ?? null}, email)
      WHERE id = ${id}
      RETURNING id, name, email, role
    `;

    const summary = diffSummary(existing, { name: body.name, role: body.role, email: body.email }, STAKEHOLDER_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: stakeholder.name, action: "updated", summary });

    return json({ stakeholder });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, name FROM stakeholders WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE stakeholders SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: existing.name, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/stakeholders" };
