import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess, isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";
import { sanitizeCharter, charterWritten } from "../lib/charter.ts";
import { APPROVAL_OPTIONS, approvalStatus, charterApprovalContext, charterApprovalTitle } from "../lib/charterApproval.ts";

// Optional sponsor sign-off on the charter. Requesting approval snapshots the
// charter into a normal Decision (so the sponsor answers from the same public
// link every decision uses, and it shows in the Decisions tab and feed) and
// remembers it on the project. "Outdated" means the charter has been edited
// since that snapshot was taken.

async function readApproval(database: ReturnType<typeof db>, projectId: string) {
  const [row] = await database.sql`
    SELECT p.charter, dr.id, dr.status, dr.context, dr.public_token, dr.created_at,
      rec.chosen_option, rec.responder_name, rec.responded_at
    FROM projects p
    JOIN decision_requests dr ON dr.id = p.charter_decision_id AND dr.deleted_at IS NULL
    LEFT JOIN decision_records rec ON rec.decision_request_id = dr.id
    WHERE p.id = ${projectId}
  `;
  if (!row) return null;
  const current = sanitizeCharter(row.charter) ?? {};
  return {
    decisionId: row.id,
    status: approvalStatus({ status: String(row.status), chosen_option: (row.chosen_option as string | null) ?? null }),
    publicToken: row.public_token,
    requestedAt: row.created_at,
    responderName: row.responder_name ?? null,
    respondedAt: row.responded_at ?? null,
    outdated: charterApprovalContext(current) !== row.context,
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
    return json({ approval: await readApproval(database, projectId) });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [project] = await database.sql`SELECT name, charter FROM projects WHERE id = ${projectId}`;
    if (!project) return json({ error: "Not found" }, { status: 404 });
    if (!charterWritten(project.charter)) {
      return json({ error: "Write the charter's purpose before asking for approval." }, { status: 400 });
    }
    const charter = sanitizeCharter(project.charter) ?? {};

    const [decision] = await database.sql`
      INSERT INTO decision_requests (project_id, title, context, options, public_token)
      VALUES (${projectId}, ${charterApprovalTitle(project.name)}, ${charterApprovalContext(charter)}, ${JSON.stringify(APPROVAL_OPTIONS)}, ${crypto.randomBytes(24).toString("base64url")})
      RETURNING id, title
    `;
    await database.sql`UPDATE projects SET charter_decision_id = ${decision.id} WHERE id = ${projectId}`;
    await logActivity(database, { projectId, entityType: "decision", entityId: decision.id, entityTitle: decision.title, action: "created" });
    return json({ approval: await readApproval(database, projectId) }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/charter-approval" };
