import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";
import { findValidToken, markEmailVerified } from "../lib/emailVerification.ts";

// Public: the link in the confirmation email lands on the app's /verify-email
// page, which posts the token here. It does not sign anyone in -- the link only
// proves the mailbox, and the person signs in with their password as usual.

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = (await req.json().catch(() => null)) as any;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return json({ error: "This confirmation link is incomplete." }, { status: 400 });

  const database = db();
  const ipOk = await checkRateLimit(database, `verify-email:ip:${getClientIp(req)}`, 30, 15);
  if (!ipOk) return json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const record = await findValidToken(database, token);
  if (!record) {
    return json({ error: "This confirmation link is invalid or has expired. Sign in and ask for a new one." }, { status: 400 });
  }
  // The address was corrected after this link was sent: the link no longer
  // proves the mailbox the account now uses.
  if (record.token_email !== record.current_email) {
    return json({ error: "This link was sent to an old address. Sign in and ask for a new one." }, { status: 400 });
  }

  await database.sql`UPDATE email_verification_tokens SET used_at = now() WHERE id = ${record.id}`;
  const result = await markEmailVerified(database, record.user_id);
  return json({ ok: true, email: record.current_email, founding: result.founding });
});

export const config: Config = { path: "/api/auth/verify-email" };
