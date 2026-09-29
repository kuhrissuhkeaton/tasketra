import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess, isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";
import { sanitizeCharter } from "../lib/charter.ts";
import { approvalStatus } from "../lib/charterApproval.ts";
import { isStage } from "../lib/stageChecklist.ts";
import { GATE_OPTIONS, gateContext, gateTitle, parseGateRef } from "../lib/stageGate.ts";

// Optional sponsor sign-off at a stage change. The owner asks after moving a
// project forward; the request is a normal Decision the sponsor answers from
// the public link. Only the most recent request is remembered on the project.

async function readGate(database: ReturnType<typeof db>, projectId: string) {
  const [row] = await database.sql`
    SELECT p.stage_gate, dr.status, dr.public_token, dr.created_at,
      rec.chosen_option, rec.responder_name, rec.responded_at
    FROM projects p
    JOIN decision_requests dr ON dr.id::text = p.stage_gate->>'decisionId' AND dr.deleted_at IS NULL
    LEFT JOIN decision_records rec ON rec.decision_request_id = dr.id
    WHERE p.id = ${projectId}
  `;
  const ref = row ? parseGateRef(row.stage_gate) : null;
  if (!row || !ref) return null;
  return {
    decisionId: ref.decisionId,
    from: ref.from,
    to: ref.to,
    status: approvalStatus({ status: String(row.status), chosen_option: (row.chosen_option as string | null) ?? null }),
    publicToken: row.public_token,
    requestedAt: row.created_at,
    responderName: row.responder_name ?? null,
    respondedAt: row.responded_at ?? null,
  };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    return json({ gate: await readGate(database, projectId) });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!isStage(body?.from) || !isStage(body?.to) || body.from === body.to) {
      return json({ error: "from and to must be two different stages." }, { status: 400 });
    }
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [project] = await database.sql`SELECT name, charter FROM projects WHERE id = ${projectId}`;
    if (!project) return json({ error: "Not found" }, { status: 404 });
    const charter = sanitizeCharter(project.charter) ?? {};

    const [decision] = await database.sql`
      INSERT INTO decision_requests (project_id, title, context, options, public_token)
      VALUES (${projectId}, ${gateTitle(project.name, body.from, body.to)}, ${gateContext(project.name, body.from, body.to, charter)}, ${JSON.stringify(GATE_OPTIONS)}, ${crypto.randomBytes(24).toString("base64url")})
      RETURNING id, title
    `;
    await database.sql`
      UPDATE projects SET stage_gate = ${JSON.stringify({ decisionId: decision.id, from: body.from, to: body.to })}::jsonb
      WHERE id = ${projectId}
    `;
    await logActivity(database, { projectId, entityType: "decision", entityId: decision.id, entityTitle: decision.title, action: "created" });
    return json({ gate: await readGate(database, projectId) }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/stage-gate" };
