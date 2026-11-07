import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getStrictAdmin } from "../lib/adminGate.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  if (!(await getStrictAdmin(database, userId))) return json({ error: "Not authorized" }, { status: 403 });

  const members = await database.sql`
    SELECT id, email, display_name, job_title, created_at
    FROM users
    WHERE founding_member = true
    ORDER BY created_at ASC
  `;
  return json({ members });
});

export const config: Config = { path: "/api/founding-members" };
