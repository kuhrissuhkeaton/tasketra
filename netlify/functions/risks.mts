import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

const VALID_LEVELS = ["low", "medium", "high"];
const VALID_STATUSES = ["open", "monitoring", "resolved"];
const RISK_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "probability", label: "probability" },
  { key: "impact", label: "impact" },
  { key: "mitigation", label: "mitigation" },
  { key: "owner_name", label: "owner" },
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

    const risks = await database.sql`
      SELECT id, title, description, probability, impact, mitigation, owner_name, status, created_at, updated_at, resolved_at
      FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END,
        CASE WHEN probability = 'high' AND impact = 'high' THEN 0
             WHEN probability = 'high' OR impact = 'high' THEN 1
             WHEN probability = 'medium' AND impact = 'medium' THEN 2
             ELSE 3 END,
        created_at DESC
    `;
    return json({ risks });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const probability = VALID_LEVELS.includes(body?.probability) ? body.probability : "medium";
    const impact = VALID_LEVELS.includes(body?.impact) ? body.impact : "medium";

    const [risk] = await database.sql`
      INSERT INTO risks (project_id, title, description, probability, impact, mitigation, owner_name)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${probability}, ${impact}, ${body?.mitigation || null}, ${body?.ownerName || null})
      RETURNING id, title, description, probability, impact, mitigation, owner_name, status, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "risk", entityId: risk.id, entityTitle: risk.title, action: "created" });
    return json({ risk }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM risks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE risks SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.probability && !VALID_LEVELS.includes(body.probability)) {
      return json({ error: "Invalid probability." }, { status: 400 });
    }
    if (body.impact && !VALID_LEVELS.includes(body.impact)) {
      return json({ error: "Invalid impact." }, { status: 400 });
    }

    const [risk] = await database.sql`
      UPDATE risks SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        probability = COALESCE(${body.probability ?? null}, probability),
        impact = COALESCE(${body.impact ?? null}, impact),
        mitigation = COALESCE(${body.mitigation ?? null}, mitigation),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        status = COALESCE(${body.status ?? null}, status),
        resolved_at = CASE WHEN ${body.status ?? null} = 'resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, probability, impact, mitigation, owner_name, status, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, probability: body.probability,
      impact: body.impact, mitigation: body.mitigation, owner_name: body.ownerName, status: body.status,
    }, RISK_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: risk.title, action: "updated", summary });

    return json({ risk });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM risks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE risks SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/risks" };
