import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { isAdminEmail } from "../lib/adminGate.ts";
import { json } from "../lib/http.ts";
import { getUserPlan } from "../lib/billing.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ user: null }, { status: 200 });

  const database = db();
  const [user] = await database.sql`
    SELECT id, email, display_name, job_title, timezone, avatar_key IS NOT NULL AS has_avatar, tour_completed_at, email_verified_at
    FROM users WHERE id = ${userId}
  `;
  if (!user) return json({ user: null });
  const plan = await getUserPlan(database, userId);
  const { email_verified_at, ...rest } = user;
  return json({ user: { ...rest, emailVerified: !!email_verified_at, isAdmin: isAdminEmail(user.email), plan } });
});

export const config: Config = { path: "/api/auth/me" };
