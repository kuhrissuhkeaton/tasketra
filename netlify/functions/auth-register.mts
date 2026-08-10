import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { hashPassword, createSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";
  const refCode = typeof body?.ref === "string" ? body.ref.trim().toLowerCase() : "";

  if (!email || !password || password.length < 8) {
    return json({ error: "Email and a password of at least 8 characters are required." }, { status: 400 });
  }

  const database = db();

  // Resolve a referral code (first 8 hex chars of the referrer's own id --
  // see referrals.mts) to the referring user. A bad, expired, or malformed
  // code just means no referral is attached; it never blocks registration.
  let referredBy: string | null = null;
  if (/^[0-9a-f]{8}$/.test(refCode)) {
    const [referrer] = await database.sql`
      SELECT id FROM users WHERE replace(id::text, '-', '') LIKE ${refCode + "%"} LIMIT 1
    `;
    if (referrer && referrer.id) referredBy = referrer.id;
  }

  // Caps mass account creation from a single source -- registration has no
  // other gate (no invite/waitlist requirement), so this is the only thing
  // standing between an open signup form and a scripted signup flood.
  const ipOk = await checkRateLimit(database, `register:ip:${getClientIp(req)}`, 8, 60);
  if (!ipOk) return json({ error: "Too many accounts created from this location. Please try again later." }, { status: 429 });

  const existing = await database.sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  // Founding-member status is computed in the same INSERT (via subquery)
  // rather than a separate SELECT-then-INSERT, to keep the race window as
  // small as possible for "first 100 ever" -- an off-by-one or two under
  // heavy concurrent signups is an acceptable outcome, a separate query pair
  // would just widen that window for no benefit.
  const [user] = await database.sql`
    INSERT INTO users (email, password_hash, founding_member, referred_by)
    VALUES (${email}, ${passwordHash}, (SELECT count(*) FROM users) < 100, ${referredBy})
    RETURNING id, email, founding_member
  `;

  // Attach this new account to any project it was invited to before it existed.
  await database.sql`
    UPDATE project_members SET user_id = ${user.id}, status = 'active', joined_at = now()
    WHERE invited_email = ${email} AND status = 'invited'
  `;

  const cookie = createSessionCookie(user.id);
  return json({ user: { id: user.id, email: user.email } }, { status: 201, headers: { "set-cookie": cookie } });
});

export const config: Config = { path: "/api/auth/register" };
