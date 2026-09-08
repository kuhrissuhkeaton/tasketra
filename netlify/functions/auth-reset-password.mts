import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { hashPassword, hashResetToken, createSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const token = body?.token || "";
  const password = body?.password || "";

  if (!token || !password || password.length < 8) {
    return json({ error: "A reset token and a password of at least 8 characters are required." }, { status: 400 });
  }

  const database = db();

  // Reset tokens are 256-bit random values, so brute-forcing one directly
  // isn't computationally realistic -- this is defense-in-depth to match
  // the rest of the auth surface (login/register/forgot-password are all
  // rate-limited) rather than a response to a practical attack.
  const ipOk = await checkRateLimit(database, `reset-password:ip:${getClientIp(req)}`, 20, 15);
  if (!ipOk) return json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const tokenHash = hashResetToken(token);

  const [record] = await database.sql`
    SELECT id, user_id FROM password_reset_tokens
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
  `;
  if (!record) {
    return json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await database.sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE id = ${record.user_id}
    RETURNING id, email
  `;

  await database.sql`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${record.id}`;
  // Invalidate any other outstanding reset links for this user.
  await database.sql`
    UPDATE password_reset_tokens SET used_at = now()
    WHERE user_id = ${record.user_id} AND used_at IS NULL
  `;

  const cookie = createSessionCookie(user.id);
  return json({ user: { id: user.id, email: user.email } }, { headers: { "set-cookie": cookie } });
});

export const config: Config = { path: "/api/auth/reset-password" };
