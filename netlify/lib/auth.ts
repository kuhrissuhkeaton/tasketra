import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { DatabaseConnection } from "@netlify/database";
import { db } from "./db.ts";
import type { UserSessionVersionRow } from "./rows.ts";

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

export function createSessionCookie(userId: string, sessionVersion: number) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expires}.${sessionVersion}`;
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

/** Parses and verifies the session cookie's signature and expiry. This is
 *  only the cryptographic half of authentication -- it proves the cookie
 *  was issued by us and has not expired, but NOT that the session is still
 *  current: revocation lives in the database (users.session_version), so
 *  the only caller-facing check is the async getUserIdFromRequest below,
 *  which compares the cookie's version against the stored one. Kept
 *  private so no code path can authenticate on signature alone. */
function parseSessionCookie(req: Request): { userId: string; sessionVersion: number } | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expires, version, sig] = parts;
  if (!/^\d+$/.test(version)) return null;
  const payload = `${userId}.${expires}.${version}`;
  if (!safeEqual(sign(payload), sig)) return null;
  if (Date.now() > Number(expires)) return null;
  return { userId, sessionVersion: Number(version) };
}

/** The one session check every handler uses (Step 1 Foundation Plan §5.4,
 *  ratification Item 8: a database check on every authenticated request, no
 *  cache, no grace window). A cookie is accepted only while its embedded
 *  session_version equals the account's stored version; incrementing the
 *  stored version (password change, password reset, "Sign out
 *  everywhere") retires every older cookie at its next request. Cookies in
 *  the pre-R2 three-segment format fail the parse and are rejected, so
 *  every member signs in once after this ships. */
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const parsed = parseSessionCookie(req);
  if (!parsed) return null;
  const database = db();
  const [row] = await database.sql<UserSessionVersionRow>`
    SELECT session_version FROM users WHERE id = ${parsed.userId}
  `;
  if (!row || row.session_version !== parsed.sessionVersion) return null;
  return parsed.userId;
}

/** Increments an account's session_version, retiring every session cookie
 *  issued at the old version, and returns the new version so the caller
 *  can re-issue the current device's cookie at it (the device performing a
 *  password change or a "Sign out everywhere" stays signed in; every other
 *  device is signed out at its next request). */
export async function bumpSessionVersion(database: DatabaseConnection, userId: string): Promise<number> {
  const [row] = await database.sql<UserSessionVersionRow>`
    UPDATE users SET session_version = session_version + 1 WHERE id = ${userId}
    RETURNING session_version
  `;
  return row.session_version;
}
