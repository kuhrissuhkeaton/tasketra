import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// Procurement/vendor tracking -- who you're buying from or contracting with,
// what it costs, and where it stands, kept as its own RAID-style entity
// rather than folded into Tasks or Budget, since "do we have an agreement
// with this vendor" is a different question from "is this task done" or
// "what did we spend," even though the tracking shape (title, owner, status)
// is the same as the rest of RAID.

const VALID_CATEGORIES = ["vendor", "contract", "purchase_order"];
const VALID_STATUSES = ["requested", "in_progress", "active", "completed", "cancelled"];
const CLOSED_STATUSES = ["completed", "cancelled"];
const PROCUREMENT_FIELDS = [
  { key: "vendor_name", label: "vendor" },
  { key: "description", label: "description" },
  { key: "category", label: "category" },
  { key: "status", label: "status" },
  { key: "owner_name", label: "owner" },
  { key: "vendor_category", label: "vendor category" },
  { key: "vendor_subcategory", label: "vendor sub-category" },
  { key: "role", label: "role" },
  { key: "cost", label: "cost" },
  { key: "start_date", label: "start date" },
  { key: "end_date", label: "end date" },
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

    const procurementItems = await database.sql`
      SELECT id, vendor_name, description, category, status, owner_name, vendor_category, vendor_subcategory, role,
        cost, start_date, end_date, created_at, updated_at, closed_at
      FROM procurement_items WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'in_progress' THEN 0 WHEN 'requested' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
        created_at DESC
    `;
    return json({ procurementItems });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const vendorName = (body?.vendorName || "").trim();
    if (!projectId || !vendorName) return json({ error: "projectId and vendorName are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "vendor";
    if (body?.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "requested";
    const closedAt = CLOSED_STATUSES.includes(status) ? new Date() : null;
    const cost = body?.cost === "" || body?.cost === undefined || body?.cost === null ? null : Number(body.cost);
    if (cost !== null && !Number.isFinite(cost)) return json({ error: "Cost must be a number." }, { status: 400 });

    const [procurementItem] = await database.sql`
      INSERT INTO procurement_items (project_id, vendor_name, description, category, owner_name, vendor_category, vendor_subcategory, role, status, cost, start_date, end_date, closed_at)
      VALUES (${projectId}, ${vendorName}, ${body?.description || null}, ${category}, ${body?.ownerName || null}, ${body?.vendorCategory || null}, ${body?.vendorSubcategory || null}, ${body?.role || null}, ${status}, ${cost}, ${body?.startDate || null}, ${body?.endDate || null}, ${closedAt})
      RETURNING id, vendor_name, description, category, status, owner_name, vendor_category, vendor_subcategory, role, cost, start_date, end_date, created_at, updated_at, closed_at
    `;
    await logActivity(database, { projectId, entityType: "procurement_item", entityId: procurementItem.id, entityTitle: procurementItem.vendor_name, action: "created" });
    return json({ procurementItem }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM procurement_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE procurement_items SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "procurement_item", entityId: id, entityTitle: existing.vendor_name, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return json({ error: "Invalid category." }, { status: 400 });
    }
    let cost: number | null = null;
    if (body.cost !== undefined && body.cost !== null && body.cost !== "") {
      cost = Number(body.cost);
      if (!Number.isFinite(cost)) return json({ error: "Cost must be a number." }, { status: 400 });
    }

    const [procurementItem] = await database.sql`
      UPDATE procurement_items SET
        vendor_name = COALESCE(${body.vendorName ?? null}, vendor_name),
        description = COALESCE(${body.description ?? null}, description),
        category = COALESCE(${body.category ?? null}, category),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        vendor_category = COALESCE(${body.vendorCategory ?? null}, vendor_category),
        vendor_subcategory = COALESCE(${body.vendorSubcategory ?? null}, vendor_subcategory),
        role = COALESCE(${body.role ?? null}, role),
        status = COALESCE(${body.status ?? null}, status),
        cost = COALESCE(${cost}, cost),
        start_date = COALESCE(${body.startDate ?? null}, start_date),
        end_date = COALESCE(${body.endDate ?? null}, end_date),
        closed_at = CASE WHEN ${body.status ?? null} IN ('completed','cancelled') THEN now() ELSE closed_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, vendor_name, description, category, status, owner_name, vendor_category, vendor_subcategory, role, cost, start_date, end_date, created_at, updated_at, closed_at
    `;

    const summary = diffSummary(existing, {
      vendor_name: body.vendorName, description: body.description, category: body.category,
      owner_name: body.ownerName, vendor_category: body.vendorCategory, vendor_subcategory: body.vendorSubcategory,
      role: body.role, status: body.status, cost: body.cost,
      start_date: body.startDate, end_date: body.endDate,
    }, PROCUREMENT_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "procurement_item", entityId: id, entityTitle: procurementItem.vendor_name, action: "updated", summary });

    return json({ procurementItem });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, vendor_name FROM procurement_items WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE procurement_items SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "procurement_item", entityId: id, entityTitle: existing.vendor_name, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/procurement" };
