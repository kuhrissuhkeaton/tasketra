import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const projectId = body?.projectId;
  const text = (body?.body || "").trim();
  if (!projectId || !text) return json({ error: "projectId and body are required." }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const database = db();
  const [update] = await database.sql`
    INSERT INTO status_updates (project_id, body) VALUES (${projectId}, ${text})
    RETURNING id, body, created_at
  `;
  return json({ statusUpdate: update }, { status: 201 });
});

export const config: Config = { path: "/api/status-updates" };
