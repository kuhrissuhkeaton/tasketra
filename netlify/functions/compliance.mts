import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// Regulatory/policy/standard/contractual obligations -- PMI's Business
// Environment "compliance" task, kept as its own RAID-style entity (same
// title/category/status/owner shape as Quality) since "are we compliant
// with this" is a different question from "is this good enough" (Quality)
// or "is something broken" (Issues).

const VALID_CATEGORIES = ["regulatory", "policy", "standard", "contractual"];
const VALID_STATUSES = ["not_started", "in_progress", "compliant", "non_compliant"];
const RESOLVED_STATUSES = ["compliant", "non_compliant"];
const COMPLIANCE_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "category", label: "category" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
  { key: "due_date", label: "due date" },
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

    const complianceItems = await database.sql`
      SELECT id, title, description, category, status, owner_name, due_date, created_at, updated_at, resolved_at
      FROM compliance_items WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'non_compliant' THEN 0 WHEN 'not_started' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
        due_date NULLS LAST, created_at DESC
    `;
    return json({ complianceItems });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "regulatory";
    if (body?.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "not_started";
    const resolvedAt = RESOLVED_STATUSES.includes(status) ? new Date() : null;

    const [complianceItem] = await database.sql`
      INSERT INTO compliance_items (project_id, title, description, category, owner_name, due_date, status, resolved_at)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${category}, ${body?.ownerName || null}, ${body?.dueDate || null}, ${status}, ${resolvedAt})
      RETURNING id, title, description, category, status, owner_name, due_date, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "compliance_item", entityId: complianceItem.id, entityTitle: complianceItem.title, action: "created" });
    return json({ complianceItem }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM compliance_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE compliance_items SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "compliance_item", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return json({ error: "Invalid category." }, { status: 400 });
    }

    const [complianceItem] = await database.sql`
      UPDATE compliance_items SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        category = COALESCE(${body.category ?? null}, category),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        due_date = COALESCE(${body.dueDate ?? null}, due_date),
        status = COALESCE(${body.status ?? null}, status),
        resolved_at = CASE WHEN ${body.status ?? null} IN ('compliant','non_compliant') THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, category, status, owner_name, due_date, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, category: body.category,
      owner_name: body.ownerName, due_date: body.dueDate, status: body.status,
    }, COMPLIANCE_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "compliance_item", entityId: id, entityTitle: complianceItem.title, action: "updated", summary });

    return json({ complianceItem });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM compliance_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE compliance_items SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "compliance_item", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/compliance" };
