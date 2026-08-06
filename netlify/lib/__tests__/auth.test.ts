import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionCookie, getUserIdFromRequest, hashPassword, verifyPassword } from "../auth.ts";

function requestWithCookie(cookieHeader: string) {
  return new Request("https://example.com/api/whatever", { headers: { cookie: cookieHeader } });
}

function extractCookieValue(setCookieHeader: string) {
  return setCookieHeader.split(";")[0];
}

describe("session cookies", () => {
  it("round-trips a valid session token back to the same user id", () => {
    const cookie = createSessionCookie("user-123");
    const req = requestWithCookie(extractCookieValue(cookie));
    expect(getUserIdFromRequest(req)).toBe("user-123");
  });

  it("rejects a request with no cookie", () => {
    const req = new Request("https://example.com/api/whatever");
    expect(getUserIdFromRequest(req)).toBeNull();
  });

  it("rejects a tampered token (signature no longer matches)", () => {
    const cookie = createSessionCookie("user-123");
    const value = extractCookieValue(cookie); // tasketra_session=userId.expires.sig
    const [name, token] = value.split("=");
    const [userId, expires] = token.split(".");
    const tampered = `${name}=${userId}-evil.${expires}.badsig`;
    const req = requestWithCookie(tampered);
    expect(getUserIdFromRequest(req)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const cookie = createSessionCookie("user-123");
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z")); // far past the 30-day expiry
    const req = requestWithCookie(extractCookieValue(cookie));
    expect(getUserIdFromRequest(req)).toBeNull();
    vi.useRealTimers();
  });

  it("ignores unrelated cookies and still finds the session cookie", () => {
    const cookie = createSessionCookie("user-456");
    const value = extractCookieValue(cookie);
    const req = requestWithCookie(`some_other_cookie=abc; ${value}; another=xyz`);
    expect(getUserIdFromRequest(req)).toBe("user-456");
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
