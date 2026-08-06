import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

const VALID_STATUSES = ["proposed", "approved", "rejected", "implemented"];
const CR_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "reason", label: "reason" },
  { key: "schedule_impact_days", label: "schedule impact" },
  { key: "budget_impact", label: "budget impact" },
  { key: "status", label: "status" },
  { key: "requested_by", label: "requested by" },
  { key: "decided_by", label: "decided by" },
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

    const changeRequests = await database.sql`
      SELECT id, title, description, reason, schedule_impact_days, budget_impact, status,
        requested_by, decided_by, created_at, updated_at, decided_at, ccb_approvals
      FROM change_requests WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 WHEN 'implemented' THEN 2 ELSE 3 END,
        created_at DESC
    `;
    return json({ changeRequests });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [changeRequest] = await database.sql`
      INSERT INTO change_requests (project_id, title, description, reason, schedule_impact_days, budget_impact, requested_by)
      VALUES (
        ${projectId}, ${title}, ${body?.description || null}, ${body?.reason || null},
        ${body?.scheduleImpactDays ?? null}, ${body?.budgetImpact ?? null}, ${body?.requestedBy || null}
      )
      RETURNING id, title, description, reason, schedule_impact_days, budget_impact, status,
        requested_by, decided_by, created_at, updated_at, decided_at, ccb_approvals
    `;
    await logActivity(database, { projectId, entityType: "change_request", entityId: changeRequest.id, entityTitle: changeRequest.title, action: "created" });
    return json({ changeRequest }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM change_requests WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE change_requests SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "change_request", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.ccbSignOff) {
      const [{ email }] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
      const [reviewerRow] = await database.sql`
        SELECT 1 FROM project_members WHERE project_id = ${existing.project_id} AND user_id = ${userId} AND is_ccb_reviewer = true
      `;
      const isOwner = await database.sql`SELECT 1 FROM projects WHERE id = ${existing.project_id} AND owner_id = ${userId}`;
      if (!reviewerRow && isOwner.length === 0) {
        return json({ error: "Only a designated CCB reviewer can sign off." }, { status: 403 });
      }
      const approvals: { email: string; approved_at: string }[] = Array.isArray(existing.ccb_approvals) ? existing.ccb_approvals : [];
      const already = approvals.some((a) => a.email === email);
      const nextApprovals = already ? approvals : [...approvals, { email, approved_at: new Date().toISOString() }];

      const [changeRequest] = await database.sql`
        UPDATE change_requests SET ccb_approvals = ${JSON.stringify(nextApprovals)}, updated_at = now()
        WHERE id = ${id}
        RETURNING id, title, description, reason, schedule_impact_days, budget_impact, status,
          requested_by, decided_by, created_at, updated_at, decided_at, ccb_approvals
      `;
      if (!already) {
        await logActivity(database, { projectId: existing.project_id, entityType: "change_request", entityId: id, entityTitle: existing.title, action: "updated", summary: `${email} signed off (CCB)` });
      }
      return json({ changeRequest });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }

    if (body.status === "approved") {
      const [project] = await database.sql`SELECT ccb_enabled FROM projects WHERE id = ${existing.project_id}`;
      if (project?.ccb_enabled) {
        const reviewers = await database.sql`
          SELECT invited_email AS email FROM project_members WHERE project_id = ${existing.project_id} AND is_ccb_reviewer = true
        `;
        const approvals: { email: string }[] = Array.isArray(existing.ccb_approvals) ? existing.ccb_approvals : [];
        const approvedEmails = new Set(approvals.map((a) => a.email));
        const missing = reviewers.filter((r: any) => !approvedEmails.has(r.email));
        if (reviewers.length === 0) {
          return json({ error: "This project has CCB enabled but no reviewers assigned yet -- add at least one CCB reviewer on the Team tab before approving." }, { status: 400 });
        }
        if (missing.length > 0) {
          return json({ error: `Waiting on CCB sign-off from: ${missing.map((r: any) => r.email).join(", ")}.` }, { status: 400 });
        }
      }
    }

    const [changeRequest] = await database.sql`
      UPDATE change_requests SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        reason = COALESCE(${body.reason ?? null}, reason),
        schedule_impact_days = COALESCE(${body.scheduleImpactDays ?? null}, schedule_impact_days),
        budget_impact = COALESCE(${body.budgetImpact ?? null}, budget_impact),
        status = COALESCE(${body.status ?? null}, status),
        requested_by = COALESCE(${body.requestedBy ?? null}, requested_by),
        decided_by = COALESCE(${body.decidedBy ?? null}, decided_by),
        decided_at = CASE WHEN ${body.status ?? null} IN ('approved','rejected') THEN now() ELSE decided_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, reason, schedule_impact_days, budget_impact, status,
        requested_by, decided_by, created_at, updated_at, decided_at, ccb_approvals
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, reason: body.reason,
      schedule_impact_days: body.scheduleImpactDays, budget_impact: body.budgetImpact,
      status: body.status, requested_by: body.requestedBy, decided_by: body.decidedBy,
    }, CR_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "change_request", entityId: id, entityTitle: changeRequest.title, action: "updated", summary });

    return json({ changeRequest });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM change_requests WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE change_requests SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "change_request", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/change-requests" };
