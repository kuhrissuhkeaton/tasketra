import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import accountHandler from "../account.mts";
import resetPasswordHandler from "../auth-reset-password.mts";
import adminAccountsHandler from "../admin-accounts.mts";
import authMeHandler from "../auth-me.mts";
import { createSessionCookie, getUserIdFromRequest, hashResetToken } from "../../lib/auth.ts";
import { db } from "../../lib/db.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";

// T-W5-1 (Step 1 Foundation Plan §5.7): session revocation end to end.
// Two cookies for one account stand in for two devices. A credential
// change (password change, password reset, "Sign out everywhere", or the
// platform-admin action) must retire the OTHER device's cookie at its
// next request, while the device that made the change is re-issued at the
// new version and keeps working.

const FIXTURE_PASSWORD = "irrelevant-for-these-tests-123";

function requestWithCookie(cookie: string) {
  return new Request("https://app.tasketra.com/api/auth/me", { headers: { cookie } });
}

/** Who does this cookie currently authenticate as? null once retired. */
async function probe(cookie: string): Promise<string | null> {
  const res = await authMeHandler(requestWithCookie(cookie));
  const body = await jsonBody<{ user: { id: string } | null }>(res);
  return body.user?.id ?? null;
}

function responseCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("expected a set-cookie header on the response");
  return setCookie.split(";")[0];
}

describe("session revocation (T-W5-1)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
  });

  it("password change kills the other session; the changing device stays signed in", async () => {
    const user = await createTestUser("pw-change@example.com");
    const otherDevice = createSessionCookie(user.id, 0).split(";")[0];
    expect(await probe(otherDevice)).toBe(user.id);

    const res = await accountHandler(
      asUser(user, {
        method: "PATCH",
        url: "https://app.tasketra.com/api/account",
        body: { action: "change-password", currentPassword: FIXTURE_PASSWORD, newPassword: "a-brand-new-passphrase" },
      })
    );
    expect(res.status).toBe(200);

    expect(await probe(otherDevice)).toBeNull(); // the other device is out
    expect(await probe(user.cookie)).toBeNull(); // even this device's OLD cookie is retired
    expect(await probe(responseCookie(res))).toBe(user.id); // its re-issued cookie works
  });

  it("password reset kills existing sessions; the reset device is signed in fresh", async () => {
    const user = await createTestUser("pw-reset@example.com");
    expect(await probe(user.cookie)).toBe(user.id);

    await db().sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${hashResetToken("r2-reset-token")}, now() + interval '1 hour')
    `;
    const res = await resetPasswordHandler(
      new Request("https://app.tasketra.com/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-nf-client-connection-ip": "198.51.100.99" },
        body: JSON.stringify({ token: "r2-reset-token", password: "a-brand-new-passphrase" }),
      })
    );
    expect(res.status).toBe(200);

    expect(await probe(user.cookie)).toBeNull();
    expect(await probe(responseCookie(res))).toBe(user.id);
  });

  it("Sign out everywhere kills the other session and keeps this device signed in", async () => {
    const user = await createTestUser("sign-out-everywhere@example.com");
    const otherDevice = createSessionCookie(user.id, 0).split(";")[0];
    expect(await probe(otherDevice)).toBe(user.id);

    const res = await accountHandler(
      asUser(user, {
        method: "PATCH",
        url: "https://app.tasketra.com/api/account",
        body: { action: "sign-out-everywhere" },
      })
    );
    expect(res.status).toBe(200);

    expect(await probe(otherDevice)).toBeNull();
    expect(await probe(user.cookie)).toBeNull();
    expect(await probe(responseCookie(res))).toBe(user.id);
  });

  it("the platform-admin action retires every session the target holds", async () => {
    process.env.ADMIN_EMAIL = "platform-admin@example.com";
    const admin = await createTestUser("platform-admin@example.com");
    const target = await createTestUser("target@example.com");
    expect(await probe(target.cookie)).toBe(target.id);

    const forbidden = await adminAccountsHandler(
      asUser(target, {
        method: "POST",
        url: "https://app.tasketra.com/api/admin-accounts",
        body: { userId: target.id, action: "sign-out-everywhere" },
      })
    );
    expect(forbidden.status).toBe(403); // a non-admin cannot use it on anyone

    const res = await adminAccountsHandler(
      asUser(admin, {
        method: "POST",
        url: "https://app.tasketra.com/api/admin-accounts",
        body: { userId: target.id, action: "sign-out-everywhere" },
      })
    );
    expect(res.status).toBe(200);
    expect(await probe(target.cookie)).toBeNull();
    expect(await probe(admin.cookie)).toBe(admin.id); // the admin's own session is untouched
  });

  it("a pre-R2 three-segment cookie is rejected even with a valid signature", async () => {
    const user = await createTestUser("old-format@example.com");
    const secret = process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me";
    const expires = Date.now() + 60_000;
    const payload = `${user.id}.${expires}`;
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    expect(await probe(`tasketra_session=${payload}.${sig}`)).toBeNull();
  });

  it("measures the per-request cost of the version check (test environment)", async () => {
    const user = await createTestUser("latency@example.com");
    const req = requestWithCookie(user.cookie);
    // Warm-up, then time the full checked lookup (parse + signature + the
    // session_version SELECT) against this file's disposable Postgres.
    for (let i = 0; i < 10; i++) await getUserIdFromRequest(req);
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await getUserIdFromRequest(req);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(
      `[latency] getUserIdFromRequest (PGlite test DB, 100 samples): mean ${mean.toFixed(2)}ms, p95 ${p95.toFixed(2)}ms`
    );
    expect(samples.length).toBe(100);
  });
});
