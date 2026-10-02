import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import registerHandler from "../auth-register.mts";
import loginHandler from "../auth-login.mts";
import { db } from "../../lib/db.ts";
import { jsonBody, verifyAccount } from "./fixtures.ts";

// Real HTTP-shaped requests against the actual handlers, against a real
// (disposable) Postgres -- these exercise the exact code path a live
// request would, including the SQL itself, not a mock of it.

function registerRequest(email: string, password: string, ip = "203.0.113.1", ref?: string) {
  return new Request("https://tasketra.com/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip },
    body: JSON.stringify({ email, password, ...(ref ? { ref } : {}) }),
  });
}

function loginRequest(email: string, password: string, ip = "203.0.113.1") {
  return new Request("https://tasketra.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth-register", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("registers a new account and returns a session cookie", async () => {
    const res = await registerHandler(registerRequest("new@example.com", "correcthorse123"));
    expect(res.status).toBe(201);
    const body = await jsonBody<{ user: { id: string; email: string } }>(res);
    expect(body.user.email).toBe("new@example.com");
    expect(res.headers.get("set-cookie")).toMatch(/^tasketra_session=/);
  });

  it("rejects a duplicate email with 409", async () => {
    await registerHandler(registerRequest("dupe@example.com", "correcthorse123"));
    const res = await registerHandler(registerRequest("dupe@example.com", "correcthorse123"));
    expect(res.status).toBe(409);
  });

  it("rejects a password under 8 characters", async () => {
    const res = await registerHandler(registerRequest("short@example.com", "abc123"));
    expect(res.status).toBe(400);
    const database = db();
    const rows = await database.sql`SELECT id FROM users WHERE email = 'short@example.com'`;
    expect(rows.length).toBe(0);
  });

  it("normalizes email to lowercase", async () => {
    const res = await registerHandler(registerRequest("MiXedCase@Example.com", "correcthorse123"));
    const body = await jsonBody<{ user: { id: string; email: string } }>(res);
    expect(body.user.email).toBe("mixedcase@example.com");
  });

  it("rate-limits registration bursts from the same IP", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 8; i++) {
      const res = await registerHandler(registerRequest(`burst${i}@example.com`, "correcthorse123", ip));
      expect(res.status).toBe(201);
    }
    const res = await registerHandler(registerRequest("burst-blocked@example.com", "correcthorse123", ip));
    expect(res.status).toBe(429);
  });

  it("does NOT rate-limit a different IP even after one IP is exhausted", async () => {
    const exhaustedIp = "198.51.100.8";
    for (let i = 0; i < 8; i++) {
      await registerHandler(registerRequest(`x${i}@example.com`, "correcthorse123", exhaustedIp));
    }
    const blocked = await registerHandler(registerRequest("x-blocked@example.com", "correcthorse123", exhaustedIp));
    expect(blocked.status).toBe(429);

    const res = await registerHandler(registerRequest("fresh-ip@example.com", "correcthorse123", "198.51.100.9"));
    expect(res.status).toBe(201);
  });

  describe("founding-member cutoff", () => {
    it("does not give a spot at sign-up; the spot comes when the email is confirmed", async () => {
      const res = await registerHandler(registerRequest("first@example.com", "correcthorse123", "10.0.0.1"));
      const body = await jsonBody<{ user: { id: string } }>(res);
      const database = db();
      const [before] = await database.sql`SELECT founding_member FROM users WHERE id = ${body.user.id}`;
      expect(before.founding_member).toBe(false);
      await verifyAccount(body.user.id);
      const [after] = await database.sql`SELECT founding_member FROM users WHERE id = ${body.user.id}`;
      expect(after.founding_member).toBe(true);
    });

    it("gives the 100th confirmed account a spot and the 101st none", async () => {
      const database = db();
      for (let i = 0; i < 99; i++) {
        await database.sql`
          INSERT INTO users (email, password_hash, founding_member, email_verified_at) VALUES (${`seed${i}@example.com`}, 'x', true, now())
        `;
      }
      const hundredth = await jsonBody<{ user: { id: string } }>(await registerHandler(registerRequest("hundredth@example.com", "correcthorse123", "10.0.0.2")));
      const hundredFirst = await jsonBody<{ user: { id: string } }>(await registerHandler(registerRequest("hundredfirst@example.com", "correcthorse123", "10.0.0.3")));
      await verifyAccount(hundredth.user.id);
      await verifyAccount(hundredFirst.user.id);
      const [a] = await database.sql`SELECT founding_member FROM users WHERE id = ${hundredth.user.id}`;
      const [b] = await database.sql`SELECT founding_member FROM users WHERE id = ${hundredFirst.user.id}`;
      expect(a.founding_member).toBe(true);
      expect(b.founding_member).toBe(false);
    });
  });

  describe("referral attribution", () => {
    it("attributes a signup to the referrer when a valid ref code is given", async () => {
      const referrerRes = await registerHandler(registerRequest("referrer@example.com", "correcthorse123", "10.1.0.1"));
      const referrer = await jsonBody<{ user: { id: string } }>(referrerRes);
      const code = referrer.user.id.replace(/-/g, "").slice(0, 8);

      const refereeRes = await registerHandler(registerRequest("referee@example.com", "correcthorse123", "10.1.0.2", code));
      const referee = await jsonBody<{ user: { id: string } }>(refereeRes);
      expect(refereeRes.status).toBe(201);

      const database = db();
      const [row] = await database.sql`SELECT referred_by FROM users WHERE id = ${referee.user.id}`;
      expect(row.referred_by).toBe(referrer.user.id);
    });

    it("registers successfully with no referral attached when the ref code doesn't match anyone", async () => {
      const res = await registerHandler(registerRequest("no-referrer@example.com", "correcthorse123", "10.1.0.3", "deadbeef"));
      expect(res.status).toBe(201);
      const body = await jsonBody<{ user: { id: string } }>(res);
      const database = db();
      const [row] = await database.sql`SELECT referred_by FROM users WHERE id = ${body.user.id}`;
      expect(row.referred_by).toBeNull();
    });

    it("registers successfully and ignores a malformed ref code rather than erroring", async () => {
      const res = await registerHandler(registerRequest("weird-ref@example.com", "correcthorse123", "10.1.0.4", "not-hex-at-all!!"));
      expect(res.status).toBe(201);
    });
  });
});

describe("auth-login", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    await registerHandler(registerRequest("loginuser@example.com", "correcthorse123", "192.0.2.1"));
  });

  it("logs in with correct credentials", async () => {
    const res = await loginHandler(loginRequest("loginuser@example.com", "correcthorse123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^tasketra_session=/);
  });

  it("rejects a wrong password without revealing whether the email exists", async () => {
    const wrongPassword = await loginHandler(loginRequest("loginuser@example.com", "wrongpassword"));
    const noSuchUser = await loginHandler(loginRequest("nosuchuser@example.com", "whatever123"));
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    const [wpBody, nsBody] = await Promise.all([jsonBody<{ error: string }>(wrongPassword), jsonBody<{ error: string }>(noSuchUser)]);
    expect(wpBody.error).toBe(nsBody.error); // same message either way
  });

  it("rate-limits repeated failed logins against a single email", async () => {
    const email = "loginuser@example.com";
    for (let i = 0; i < 8; i++) {
      const res = await loginHandler(loginRequest(email, "wrongpassword", `172.16.0.${i + 1}`));
      expect(res.status).toBe(401);
    }
    const res = await loginHandler(loginRequest(email, "correcthorse123", "172.16.0.99"));
    expect(res.status).toBe(429);
  });
});
