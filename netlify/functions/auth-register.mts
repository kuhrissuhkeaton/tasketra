import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { hashPassword, createSessionCookie } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";
import { withSentry } from "../lib/sentry.ts";
import { checkNewEmail } from "../lib/signupEmail.ts";
import { issueVerificationEmail } from "../lib/emailVerification.ts";
import { pgErrorCode } from "../lib/pgError.ts";
import { canonicalEmail, normalizeEmail, validatePassword } from "../lib/accountRules.ts";

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  const refCode = typeof body?.ref === "string" ? body.ref.trim().toLowerCase() : "";
  // The sign-up form shows "By creating an account, you agree to the Terms",
  // and sends this flag; we record when, so there's a dated record of consent.
  const acceptedTerms = body?.acceptedTerms === true;

  // Shape, disposable domains, likely typos (gmail.co) and a domain that can
  // actually receive mail. A typo comes back with the corrected address so the
  // form can offer it in one click.
  const emailProblem = await checkNewEmail(email);
  if (emailProblem) return json(emailProblem, { status: 400 });
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
  // A founding spot is NOT given here. It is awarded when the person confirms
  // their email (see markEmailVerified), so an address nobody can read, or a
  // typo, can never hold one.
  let user: { id: string; email: string };
  try {
    [user] = await database.sql`
      INSERT INTO users (email, email_canonical, password_hash, referred_by, terms_accepted_at)
      VALUES (${email}, ${canonical}, ${passwordHash}, ${referredBy}, ${acceptedTerms ? new Date().toISOString() : null})
      RETURNING id, email
    `;
  } catch (err: any) {
    // Two sign-ups for the same mailbox at the same instant: the unique index
    // lets one through and rejects the other.
    if (pgErrorCode(err) === "23505") return json({ error: "An account with this email already exists." }, { status: 409 });
    throw err;
  }

  // Project invitations sent to this address are attached once the address is
  // confirmed, not now: until then we don't know the person owns the mailbox.
  const verificationEmailSent = await issueVerificationEmail(database, user.id, user.email).catch(() => false);

  const cookie = createSessionCookie(user.id);
  return json({ user: { id: user.id, email: user.email }, verificationRequired: true, verificationEmailSent }, { status: 201, headers: { "set-cookie": cookie } });
});

export const config: Config = { path: "/api/auth/register" };
