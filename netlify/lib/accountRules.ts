// Sign-up rules in one place: what counts as a valid email, which passwords
// are acceptable, and how "the same email" is decided. The canonical-email
// logic here is mirrored in SQL (canonical_email() in the 20261007 migration)
// so the database enforces the same rule; a test checks the two agree.

import { getEnv } from "./env.ts";

// --- Founding-member cap ---------------------------------------------------

export const DEFAULT_FOUNDING_CAP = 100;

/** How many founding-member spots exist. Set FOUNDING_CAP in the environment
 *  to change it; 0 turns the program off (every signup is a normal Free
 *  account), which is what a billing test copy of the app should use. */
export function foundingCap(): number {
  const raw = getEnv("FOUNDING_CAP");
  if (raw === undefined || raw.trim() === "") return DEFAULT_FOUNDING_CAP;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_FOUNDING_CAP;
  return n;
}

// --- Email -----------------------------------------------------------------

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
// Deliberately plain: one @, something on each side, a dot in the domain, no
// spaces. Real verification is "can they read mail there", not a regex.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims, lowercases and normalises the characters of an email address. */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").normalize("NFKC").trim().toLowerCase();
}

/** Returns an error message, or null when the email is acceptable. */
export function validateEmail(email: string): string | null {
  if (!email) return "Enter your email address.";
  if (email.length > MAX_EMAIL_LENGTH) return "That email address is too long.";
  if (!EMAIL_SHAPE.test(email)) return "Enter a valid email address.";
  const [local, domain] = email.split("@");
  if (local.length > MAX_LOCAL_LENGTH) return "That email address is too long.";
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return "Enter a valid email address.";
  if (isDisposableDomain(domain)) return "Please use a permanent email address, not a disposable one.";
  return null;
}

/** The form of an address used to decide "is this the same mailbox": lowercase,
 *  anything after a "+" in the part before the @ is ignored, and for Gmail the
 *  dots in the part before the @ are ignored too (googlemail.com is gmail.com).
 *  Must stay identical to canonical_email() in the database. */
export function canonicalEmail(raw: string): string {
  const email = normalizeEmail(raw);
  const at = email.indexOf("@");
  if (at < 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const stripped = local.split("+")[0];
  if (stripped !== "") local = stripped;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    const noDots = local.replace(/\./g, "");
    if (noDots !== "") local = noDots;
  }
  return `${local}@${domain}`;
}

// Throwaway-mailbox services. Not exhaustive and never will be; it stops the
// obvious ones from claiming a founding spot or a free trial.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "throwawaymail.com", "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.net",
  "getnada.com", "dispostable.com", "maildrop.cc", "mintemail.com", "fakeinbox.com",
  "mailnesia.com", "mohmal.com", "emailondeck.com", "spamgourmet.com", "tempinbox.com",
  "burnermail.io", "discard.email", "grr.la", "moakt.com", "tmpmail.org",
]);

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

// --- Password --------------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only reads the first 72 bytes, so anything longer is silently
// truncated. Refuse it instead of pretending it was all used.
export const MAX_PASSWORD_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "11111111", "00000000", "87654321", "123123123", "12341234",
  "qwertyui", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "qazwsxedc", "abc12345", "abcd1234",
  "iloveyou", "letmein1", "welcome1", "welcome123", "admin123", "administrator", "changeme", "trustno1",
  "football", "baseball", "monkey123", "dragon123", "sunshine", "princess", "tasketra", "tasketra1", "tasketra123",
]);

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: string, email?: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return `Use a password of ${MAX_PASSWORD_BYTES} bytes or fewer (about ${MAX_PASSWORD_BYTES} characters).`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "That password is too common. Choose something harder to guess.";
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess. Choose something harder to guess.";
  if (email) {
    const e = normalizeEmail(email);
    const local = e.split("@")[0];
    if (lower === e || (local.length >= 4 && lower === local)) {
      return "Your password can't be the same as your email address.";
    }
  }
  return null;
}
