import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { createSessionCookie, getUserIdFromRequest, hashPassword, verifyPassword, bumpSessionVersion } from "../auth.ts";
import { db } from "../db.ts";
import { setupTestDb, teardownTestDb, resetTestDb } from "./testDb.ts";

function requestWithCookie(cookieHeader: string) {
  return new Request("https://example.com/api/whatever", { headers: { cookie: cookieHeader } });
}

function extractCookieValue(setCookieHeader: string) {
  return setCookieHeader.split(";")[0];
}

async function insertUser(email: string): Promise<string> {
  const [user] = await db().sql<{ id: string }>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'not-a-real-hash') RETURNING id
  `;
  return user.id;
}

describe("session cookies", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("round-trips a valid session token back to the same user id", async () => {
    const id = await insertUser("round-trip@example.com");
    const cookie = createSessionCookie(id, 0);
    const req = requestWithCookie(extractCookieValue(cookie));
    await expect(getUserIdFromRequest(req)).resolves.toBe(id);
  });

  it("rejects a request with no cookie", async () => {
    const req = new Request("https://example.com/api/whatever");
    await expect(getUserIdFromRequest(req)).resolves.toBeNull();
  });

  it("rejects a tampered token (signature no longer matches)", async () => {
    const id = await insertUser("tampered@example.com");
    const cookie = createSessionCookie(id, 0);
    const value = extractCookieValue(cookie); // tasketra_session=userId.expires.version.sig
    const [name, token] = value.split("=");
    const [userId, expires, version] = token.split(".");
    const tampered = `${name}=${userId}-evil.${expires}.${version}.badsig`;
    const req = requestWithCookie(tampered);
    await expect(getUserIdFromRequest(req)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const id = await insertUser("expired@example.com");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const cookie = createSessionCookie(id, 0);
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z")); // far past the 30-day expiry
    const req = requestWithCookie(extractCookieValue(cookie));
    await expect(getUserIdFromRequest(req)).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("ignores unrelated cookies and still finds the session cookie", async () => {
    const id = await insertUser("mixed-cookies@example.com");
    const cookie = createSessionCookie(id, 0);
    const value = extractCookieValue(cookie);
    const req = requestWithCookie(`some_other_cookie=abc; ${value}; another=xyz`);
    await expect(getUserIdFromRequest(req)).resolves.toBe(id);
  });

  it("rejects a cookie whose version no longer matches the account's", async () => {
    const id = await insertUser("revoked@example.com");
    const cookie = createSessionCookie(id, 0);
    await db().sql`UPDATE users SET session_version = 1 WHERE id = ${id}`;
    const req = requestWithCookie(extractCookieValue(cookie));
    await expect(getUserIdFromRequest(req)).resolves.toBeNull();
  });

  it("rejects a pre-R2 three-segment cookie even when its signature is valid", async () => {
    const id = await insertUser("old-format@example.com");
    // Exactly what every member held on R2 deploy day: userId.expires.sig,
    // signed with the real secret (the dev fallback signs in tests, where
    // the Netlify global does not exist -- see getSecret in ../auth.ts).
    const secret = process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me";
    const expires = Date.now() + 60_000;
    const payload = `${id}.${expires}`;
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const req = requestWithCookie(`tasketra_session=${payload}.${sig}`);
    await expect(getUserIdFromRequest(req)).resolves.toBeNull();
  });

  it("bumpSessionVersion retires old cookies and admits ones at the new version", async () => {
    const id = await insertUser("bump@example.com");
    const database = db();
    const newVersion = await bumpSessionVersion(database, id);
    expect(newVersion).toBe(1);
    const oldReq = requestWithCookie(extractCookieValue(createSessionCookie(id, 0)));
    await expect(getUserIdFromRequest(oldReq)).resolves.toBeNull();
    const newReq = requestWithCookie(extractCookieValue(createSessionCookie(id, newVersion)));
    await expect(getUserIdFromRequest(newReq)).resolves.toBe(id);
  });
});

describe("password hashing", () => {
  it("hashes a password such that it is not stored in plain text", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password against the hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});
