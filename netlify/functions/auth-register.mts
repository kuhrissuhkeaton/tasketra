import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { hashPassword, createSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";
import { pgErrorCode } from "../lib/pgError.ts";
import { canonicalEmail, foundingCap, normalizeEmail, validateEmail, validatePassword } from "../lib/accountRules.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  const refCode = typeof body?.ref === "string" ? body.ref.trim().toLowerCase() : "";
  // The sign-up form shows "By creating an account, you agree to the Terms",
  // and sends this flag; we record when, so there's a dated record of consent.
  const acceptedTerms = body?.acceptedTerms === true;

  const emailError = validateEmail(email);
  if (emailError) return json({ error: emailError }, { status: 400 });
  const passwordError = validatePassword(password, email);
  if (passwordError) return json({ error: passwordError }, { status: 400 });

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

  // "Same email" means the same mailbox, not just the same text: name+tag@
  // and (for Gmail) n.a.m.e@ reach the same inbox as name@, so they count as
  // the same address. The unique index on email_canonical backs this up if two
  // sign-ups race.
  const canonical = canonicalEmail(email);
  const existing = await database.sql`SELECT id FROM users WHERE email = ${email} OR email_canonical = ${canonical}`;
  if (existing.length > 0) {
    return json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  // Founding-member status is computed in the same INSERT (via subquery)
  // rather than a separate SELECT-then-INSERT, to keep the race window as
  // small as possible for "first N ever" -- an off-by-one or two under
  // heavy concurrent signups is an acceptable outcome. It counts accounts
  // that actually hold a founding spot (not every account ever made), so
  // removing a test or duplicate account reopens its spot. The cap comes from
  // the FOUNDING_CAP setting (default 100; 0 turns the program off).
  const cap = foundingCap();
  let user: { id: string; email: string; founding_member: boolean };
  try {
    [user] = await database.sql`
      INSERT INTO users (email, email_canonical, password_hash, founding_member, referred_by, terms_accepted_at)
      VALUES (
        ${email}, ${canonical}, ${passwordHash},
        (SELECT count(*) FROM users WHERE founding_member = true) < ${cap},
        ${referredBy}, ${acceptedTerms ? new Date().toISOString() : null}
      )
      RETURNING id, email, founding_member
    `;
  } catch (err: any) {
    // Two sign-ups for the same mailbox at the same instant: the unique index
    // lets one through and rejects the other.
    if (pgErrorCode(err) === "23505") return json({ error: "An account with this email already exists." }, { status: 409 });
    throw err;
  }

  // Attach this new account to any project it was invited to before it existed.
  await database.sql`
    UPDATE project_members SET user_id = ${user.id}, status = 'active', joined_at = now()
    WHERE invited_email = ${email} AND status = 'invited'
  `;

  const cookie = createSessionCookie(user.id);
  return json({ user: { id: user.id, email: user.email } }, { status: 201, headers: { "set-cookie": cookie } });
});

export const config: Config = { path: "/api/auth/register" };
