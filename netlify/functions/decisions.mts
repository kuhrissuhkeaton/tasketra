import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";

// Decisions don't get a general edit endpoint: once a decision has been sent
// (or answered) via its public link, retroactively changing the title or
// options gets semantically messy. Delete/restore is supported like every
// other entity; editing is deliberately out of scope for now.

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const decisions = await database.sql`
      SELECT dr.id, dr.title, dr.context, dr.options, dr.deadline, dr.public_token, dr.status, dr.created_at,
        rec.chosen_option, rec.responder_name, rec.responded_at,
        COALESCE(
          (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
             FROM decision_request_recipients rr
             JOIN stakeholders s ON s.id = rr.stakeholder_id
             WHERE rr.decision_request_id = dr.id),
          '[]'
        ) AS recipients
      FROM decision_requests dr
      LEFT JOIN decision_records rec ON rec.decision_request_id = dr.id
      WHERE dr.project_id = ${projectId} AND dr.deleted_at IS NULL
      ORDER BY dr.created_at DESC
    `;
    return json({ decisions });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    const options: string[] = Array.isArray(body?.options) ? body.options.filter(Boolean) : [];
    const recipientIds: string[] = Array.isArray(body?.stakeholderIds) ? body.stakeholderIds : [];

    if (!projectId || !title || options.length < 2) {
      return json({ error: "projectId, title, and at least two options are required." }, { status: 400 });
    }
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const publicToken = crypto.randomBytes(24).toString("base64url");

    const [decision] = await database.sql`
      INSERT INTO decision_requests (project_id, title, context, options, deadline, public_token)
      VALUES (${projectId}, ${title}, ${body?.context || null}, ${JSON.stringify(options)}, ${body?.deadline || null}, ${publicToken})
      RETURNING id, title, context, options, deadline, public_token, status, created_at
    `;

    for (const stakeholderId of recipientIds) {
      await database.sql`
        INSERT INTO decision_request_recipients (decision_request_id, stakeholder_id)
        VALUES (${decision.id}, ${stakeholderId})
      `;
    }

    await logActivity(database, { projectId, entityType: "decision", entityId: decision.id, entityTitle: decision.title, action: "created" });
    return json({ decision, shareUrl: `/d/${publicToken}` }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id || !body?.restore) return json({ error: "id and restore are required." }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM decision_requests WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE decision_requests SET deleted_at = NULL WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "decision", entityId: id, entityTitle: existing.title, action: "restored" });
    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM decision_requests WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE decision_requests SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "decision", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/decisions" };
