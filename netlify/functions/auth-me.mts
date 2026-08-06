import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { getUserPlan } from "../lib/billing.ts";
import { withSentry } from "../lib/sentry.ts";

/**
 * Mirrors the admin gate in waitlist.mts: if ADMIN_EMAIL isn't set, everyone
 * is treated as admin (reasonable while Tasketra has one real account).
 */
function isAdminEmail(email: string): boolean {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return true;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ user: null }, { status: 200 });

  const database = db();
  const [user] = await database.sql`SELECT id, email FROM users WHERE id = ${userId}`;
  if (!user) return json({ user: null });
  const plan = await getUserPlan(database, userId);
  return json({ user: { ...user, isAdmin: isAdminEmail(user.email), plan } });
});

export const config: Config = { path: "/api/auth/me" };
