import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";
import { isEmailVerified, issueVerificationEmail } from "../lib/emailVerification.ts";

// Signed-in, not-yet-confirmed accounts can ask for a new link. Limited to a few
// per hour so it can't be used to flood someone's inbox.

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  if (await isEmailVerified(database, userId)) return json({ ok: true, alreadyVerified: true });

  const allowed = await checkRateLimit(database, `verify-resend:user:${userId}`, 5, 60);
  if (!allowed) return json({ error: "That's a few too many emails. Wait a little while, then try again." }, { status: 429 });

  const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
  if (!user) return json({ error: "Not found" }, { status: 404 });
  const sent = await issueVerificationEmail(database, userId, user.email).catch(() => false);
  if (!sent) return json({ error: "We couldn't send the email right now. Try again in a few minutes." }, { status: 502 });
  return json({ ok: true, email: user.email });
});

export const config: Config = { path: "/api/auth/resend-verification" };
