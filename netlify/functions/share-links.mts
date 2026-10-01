import type { Config } from "@netlify/functions";
import crypto from "node:crypto";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { isShareKind } from "../lib/shareLinks.ts";

// Owner-only management of read-only share links.
//   GET    ?projectId=&kind=   -> { link: {token, created_at} | null }
//   POST   {projectId, kind}   -> creates (or returns the existing) active link
//   POST   {projectId, kind, regenerate: true} -> revokes the old, creates a new token
//   DELETE ?projectId=&kind=   -> stops sharing (revokes)

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  let projectId: string | null;
  let kind: unknown;
  let regenerate = false;
  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    projectId = body?.projectId ?? null;
    kind = body?.kind;
    regenerate = body?.regenerate === true;
  } else if (req.method === "GET" || req.method === "DELETE") {
    projectId = url.searchParams.get("projectId");
    kind = url.searchParams.get("kind");
  } else {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!isShareKind(kind)) return json({ error: "Unknown document kind." }, { status: 400 });
  if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const active = async () => {
    const [row] = await database.sql`
      SELECT token, created_at FROM share_links
      WHERE project_id = ${projectId} AND kind = ${kind} AND revoked_at IS NULL
    `;
    return row ?? null;
  };

  if (req.method === "GET") return json({ link: await active() });

  if (req.method === "DELETE") {
    await database.sql`
      UPDATE share_links SET revoked_at = now()
      WHERE project_id = ${projectId} AND kind = ${kind} AND revoked_at IS NULL
    `;
    return json({ link: null });
  }

  // POST
  if (regenerate) {
    await database.sql`
      UPDATE share_links SET revoked_at = now()
      WHERE project_id = ${projectId} AND kind = ${kind} AND revoked_at IS NULL
    `;
  } else {
    const existing = await active();
    if (existing) return json({ link: existing });
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const [created] = await database.sql`
    INSERT INTO share_links (project_id, kind, token, created_by)
    VALUES (${projectId}, ${kind}, ${token}, ${userId})
    RETURNING token, created_at
  `;
  return json({ link: created }, { status: 201 });
});

export const config: Config = { path: "/api/share-links" };
