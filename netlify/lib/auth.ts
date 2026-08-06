import crypto from "node:crypto";
import bcrypt from "bcryptjs";

declare const Netlify: { env: { get(key: string): string | undefined } } | undefined;

const COOKIE_NAME = "tasketra_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const fromNetlify = typeof Netlify !== "undefined" ? Netlify.env.get("SESSION_SECRET") : undefined;
  return fromNetlify || process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
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
  if (sign(payload) !== sig) return null;
  if (Date.now() > Number(expires)) return null;
  return userId;
}
