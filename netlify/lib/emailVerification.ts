// Email verification: a person must prove they can read mail at the address
// before they can use the app. Also where founding-member spots are awarded
// (at verification, not at sign-up, so a typo'd or made-up address can never
// hold a spot) and where invitations sent to the address are attached.

import crypto from "node:crypto";
import { getSiteUrl } from "./env.ts";
import { sendEmail } from "./notify.ts";
import { foundingCap } from "./accountRules.ts";
import { json } from "./http.ts";

const TOKEN_HOURS = 24;

export function hashVerificationToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Creates a fresh link token for this address and retires any earlier unused ones. */
export async function createVerificationToken(database: any, userId: string, email: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  await database.sql`UPDATE email_verification_tokens SET used_at = now() WHERE user_id = ${userId} AND used_at IS NULL`;
  await database.sql`
    INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at)
    VALUES (${userId}, ${email}, ${hashVerificationToken(raw)}, now() + (${TOKEN_HOURS} || ' hours')::interval)
  `;
  return raw;
}

export async function sendVerificationEmail(email: string, rawToken: string): Promise<boolean> {
  const link = `${getSiteUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const result = await sendEmail(
    email,
    "Confirm your email for Tasketra",
    `Hi,\n\nConfirm your email address to finish setting up your Tasketra account:\n\n${link}\n\n` +
      `This link works for ${TOKEN_HOURS} hours. If you didn't sign up for Tasketra, you can ignore this email and nothing will happen.\n\n-- Karissa`
  );
  return !!(result as any)?.sent;
}

/** Creates a token and emails it. Returns whether the email went out. */
export async function issueVerificationEmail(database: any, userId: string, email: string): Promise<boolean> {
  const raw = await createVerificationToken(database, userId, email);
  return sendVerificationEmail(email, raw);
}

export async function isEmailVerified(database: any, userId: string): Promise<boolean> {
  const [row] = await database.sql`SELECT email_verified_at FROM users WHERE id = ${userId}`;
  return !!row?.email_verified_at;
}

/** For endpoints that must not run for an unconfirmed account. Returns a 403
 *  response to send back, or null when the account is verified. */
export async function requireVerifiedEmail(database: any, userId: string): Promise<Response | null> {
  if (await isEmailVerified(database, userId)) return null;
  return json(
    { error: "Confirm your email address first. We sent you a link when you signed up.", verificationRequired: true },
    { status: 403 }
  );
}

/** Marks the account verified (once), awards a founding spot if one is free,
 *  and attaches any project invitations that were sent to this address.
 *  Returns whether this call did the verifying and whether the account holds a
 *  founding spot afterwards. */
export async function markEmailVerified(
  database: any,
  userId: string
): Promise<{ newlyVerified: boolean; founding: boolean }> {
  const [updated] = await database.sql`
    UPDATE users SET
      email_verified_at = now(),
      founding_member = founding_member OR ((SELECT count(*) FROM users WHERE founding_member = true) < ${foundingCap()})
    WHERE id = ${userId} AND email_verified_at IS NULL
    RETURNING email, founding_member
  `;
  if (!updated) {
    const [existing] = await database.sql`SELECT founding_member FROM users WHERE id = ${userId}`;
    return { newlyVerified: false, founding: !!existing?.founding_member };
  }
  await database.sql`
    UPDATE project_members SET user_id = ${userId}, status = 'active', joined_at = now()
    WHERE invited_email = ${updated.email} AND status = 'invited'
  `;
  return { newlyVerified: true, founding: !!updated.founding_member };
}

/** Looks up an unused, unexpired link token. */
export async function findValidToken(database: any, raw: string) {
  const [row] = await database.sql`
    SELECT t.id, t.user_id, t.email AS token_email, u.email AS current_email
    FROM email_verification_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${hashVerificationToken(raw)} AND t.used_at IS NULL AND t.expires_at > now()
  `;
  return row ?? null;
}
