import crypto from "node:crypto";
import bcrypt from "bcryptjs";

declare const Netlify: { env: { get(key: string): string | undefined } } | undefined;

const COOKIE_NAME = "tasketra_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const fromNetlify = typeof Netlify !== "undefined" ? Netlify.env.get("SESSION_SECRET") : undefined;
  const secret = fromNetlify || process.env.SESSION_SECRET;
  if (secret) return secret;

  // The `Netlify` global only exists inside an actual Netlify Functions
  // runtime (deployed, or `netlify dev` locally) -- never in plain `node`/
  // `vitest`. If we're really running on Netlify and SESSION_SECRET isn't
  // set, fail loudly rather than silently signing every session with a
  // hardcoded string that's sitting in this file: anyone who read this
  // source could forge a valid login for any user. Falling back to the
  // insecure default is only ever OK outside a real Netlify runtime (unit
  // tests importing this module directly), where no real session is ever
  // exposed to the internet.
  if (typeof Netlify !== "undefined") {
    throw new Error(
      "SESSION_SECRET is not set. Set it in Netlify (Site settings -> Environment variables) before this function can safely issue sessions."
    );
  }
  return "dev-insecure-secret-change-me";
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Generates a single-use password-reset token: returns the raw token (goes in the email link)
 *  and its hash (what gets stored in the DB, so a leaked DB row can't be replayed as a valid token). */
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashResetToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionCookie(userId: string) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expires}`;
  const sig = sign(payload);
  const token = `${payload}.${sig}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Constant-time string comparison -- avoids leaking how many leading bytes
 *  of a forged signature happened to match via response-time differences.
 *  Falls back to `false` on any length mismatch (timingSafeEqual throws
 *  rather than returning false for unequal-length buffers). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getUserIdFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const payload = `${userId}.${expires}`;
  if (!safeEqual(sign(payload), sig)) return null;
  if (Date.now() > Number(expires)) return null;
  return userId;
}
