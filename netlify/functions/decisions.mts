import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

// Decisions don't get a general edit endpoint: once a decision has been sent
// (or answered) via its public link, retroactively changing the title or
// options gets semantically messy. Delete/restore is supported like every
// other entity; editing is deliberately out of scope for now.
//
// v151 (Part D, Option 1): public responses COLLECT as responses -- they no
// longer resolve the request. The owner confirms one response as the
// outcome (PATCH action "confirm"), or records an outcome directly; only
// that flips status to 'resolved'. A request's OUTCOME record is the one
// with confirmed_at set -- or, for decisions resolved before v151 (exactly
// one record, never confirmed), that single record. The OUTCOME predicate
// below is repeated wherever a reader needs the outcome
// (decision-public, charter-approval, stage-gate, weekly-report).

export default withSentry(async (req: Request) => {
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
        outcome.chosen_option, outcome.responder_name, outcome.responded_at, outcome.confirmed_at AS outcome_confirmed_at,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', rec.id, 'chosen_option', rec.chosen_option, 'responder_name', rec.responder_name,
              'responded_at', rec.responded_at, 'confirmed_at', rec.confirmed_at
            ) ORDER BY rec.responded_at ASC)
             FROM decision_records rec
             WHERE rec.decision_request_id = dr.id),
          '[]'
        ) AS records,
        COALESCE(
          (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
             FROM decision_request_recipients rr
             JOIN stakeholders s ON s.id = rr.stakeholder_id
             WHERE rr.decision_request_id = dr.id),
          '[]'
        ) AS recipients
      FROM decision_requests dr
      LEFT JOIN LATERAL (
        SELECT rec.chosen_option, rec.responder_name, rec.responded_at, rec.confirmed_at
        FROM decision_records rec
        WHERE rec.decision_request_id = dr.id
          AND (rec.confirmed_at IS NOT NULL
               OR (dr.status = 'resolved' AND NOT EXISTS (
                     SELECT 1 FROM decision_records c
                     WHERE c.decision_request_id = dr.id AND c.confirmed_at IS NOT NULL)))
        ORDER BY rec.confirmed_at DESC NULLS LAST, rec.responded_at DESC
        LIMIT 1
      ) outcome ON true
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
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title, status, options, deleted_at FROM decision_requests WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    // v151 (Part D, Option 1): the owner confirms the outcome. Either an
    // existing response is confirmed (recordId), or the owner records an
    // outcome directly (chosenOption, one of the request's options, stored
    // as a response under the owner's own name). Only this resolves the
    // request.
    if (body?.action === "confirm") {
      if (existing.deleted_at) return json({ error: "Not found" }, { status: 404 });
      if (existing.status === "resolved") {
        return json({ error: "This decision has already been decided." }, { status: 409 });
      }
      let outcomeOption: string | null = null;
      if (body?.recordId) {
        const [record] = await database.sql`
          SELECT id, chosen_option FROM decision_records
          WHERE id = ${body.recordId} AND decision_request_id = ${id}
        `;
        if (!record) return json({ error: "That response was not found." }, { status: 404 });
        await database.sql`UPDATE decision_records SET confirmed_at = now() WHERE id = ${record.id}`;
        outcomeOption = record.chosen_option;
      } else if (typeof body?.chosenOption === "string" && body.chosenOption.trim()) {
        const chosen = body.chosenOption.trim();
        const validOptions: string[] = existing.options ?? [];
        if (!validOptions.includes(chosen)) {
          return json({ error: "That is not one of this decision's options." }, { status: 400 });
        }
        const [me] = await database.sql`
          SELECT COALESCE(NULLIF(TRIM(display_name), ''), email) AS name FROM users WHERE id = ${userId}
        `;
        await database.sql`
          INSERT INTO decision_records (decision_request_id, chosen_option, responder_name, confirmed_at)
          VALUES (${id}, ${chosen}, ${me?.name ?? "Project owner"}, now())
        `;
        outcomeOption = chosen;
      } else {
        return json({ error: "recordId or chosenOption is required to confirm a decision." }, { status: 400 });
      }
      await database.sql`UPDATE decision_requests SET status = 'resolved' WHERE id = ${id}`;
      await logActivity(database, {
        projectId: existing.project_id, entityType: "decision", entityId: id, entityTitle: existing.title,
        action: "updated", summary: `Decision confirmed: ${outcomeOption}`,
      });
      return json({ ok: true });
    }

    if (!body?.restore) return json({ error: "id and restore are required." }, { status: 400 });
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
});

export const config: Config = { path: "/api/decisions" };
