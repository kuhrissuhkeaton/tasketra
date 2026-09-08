import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

/**
 * Mirrors the admin gate in waitlist.mts / auth-me.mts: if ADMIN_EMAIL isn't
 * set, any authenticated user is treated as admin -- reasonable while
 * Tasketra has one real account. Set ADMIN_EMAIL once there's more than one
 * person with a login.
 */
async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return true;
  const database = db();
  const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
  return user?.email?.toLowerCase() === adminEmail.toLowerCase();
}

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isAdmin(userId))) return json({ error: "Not authorized" }, { status: 403 });

  const database = db();
  const members = await database.sql`
    SELECT id, email, display_name, job_title, created_at
    FROM users
    WHERE founding_member = true
    ORDER BY created_at ASC
  `;
  return json({ members });
});

export const config: Config = { path: "/api/founding-members" };
