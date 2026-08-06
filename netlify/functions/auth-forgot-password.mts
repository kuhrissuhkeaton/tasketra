import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { generateResetToken } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { sendEmail } from "../lib/notify.ts";
import { getSiteUrl } from "../lib/env.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for that email, we've sent a password reset link.",
};

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json().catch(() => null) as any;
  const email = (body?.email || "").trim().toLowerCase();
  if (!email) return json({ error: "Email is required." }, { status: 400 });

  const database = db();

  // Rate-limited by both IP and email, but on limit we still return the
  // same generic response rather than a distinguishable error -- otherwise
  // the rate-limit response itself becomes a way to probe whether an email
  // has an account (or to confirm you're successfully email-bombing one).
  const ipOk = await checkRateLimit(database, `forgot-password:ip:${getClientIp(req)}`, 15, 60);
  const emailOk = await checkRateLimit(database, `forgot-password:email:${email}`, 3, 60);
  if (!ipOk || !emailOk) return json(GENERIC_RESPONSE);

  const [user] = await database.sql`SELECT id FROM users WHERE email = ${email}`;

  // Always respond the same way whether or not the account exists -- this
  // endpoint must not leak which emails have Tasketra accounts.
  if (!user) return json(GENERIC_RESPONSE);

  const { raw, hash } = generateResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await database.sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${hash}, ${expiresAt.toISOString()})
  `;

  await sendEmail(
    email,
    "Reset your Tasketra password",
    `Someone requested a password reset for your Tasketra account. If this was you, use this link within the next hour: ${getSiteUrl()}/reset-password?token=${raw}\n\nIf you didn't request this, you can safely ignore this email.`
  );

  return json(GENERIC_RESPONSE);
};

export const config: Config = { path: "/api/auth/forgot-password" };
