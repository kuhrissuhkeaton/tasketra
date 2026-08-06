import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import registerHandler from "../auth-register.mts";
import loginHandler from "../auth-login.mts";
import { db } from "../../lib/db.ts";
import { jsonBody } from "./fixtures.ts";

// Real HTTP-shaped requests against the actual handlers, against a real
// (disposable) Postgres -- these exercise the exact code path a live
// request would, including the SQL itself, not a mock of it.

function registerRequest(email: string, password: string, ip = "203.0.113.1") {
  return new Request("https://tasketra.com/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip },
    body: JSON.stringify({ email, password }),
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
    it("marks the very first signup as a founding member", async () => {
      const res = await registerHandler(registerRequest("first@example.com", "correcthorse123", "10.0.0.1"));
      const body = await jsonBody<{ user: { id: string; email: string } }>(res);
      const database = db();
      const [row] = await database.sql`SELECT founding_member FROM users WHERE id = ${body.user.id}`;
      expect(row.founding_member).toBe(true);
    });

    it("marks exactly the 100th signup as founding, and the 101st as not", async () => {
      // Insert 99 pre-existing users directly (bypassing the handler/rate
      // limiter for speed) so the next registration through the real
      // handler is genuinely the 100th.
      const database = db();
      for (let i = 0; i < 99; i++) {
        await database.sql`
          INSERT INTO users (email, password_hash, founding_member)
          VALUES (${`seed${i}@example.com`}, 'x', (SELECT count(*) FROM users) < 100)
        `;
      }
      const [{ count: before }] = await database.sql<{ count: number }>`SELECT count(*)::int AS count FROM users`;
      expect(before).toBe(99);

      const hundredth = await registerHandler(registerRequest("hundredth@example.com", "correcthorse123", "10.0.0.2"));
      const hundredthBody = await jsonBody<{ user: { id: string } }>(hundredth);
      const [hundredthRow] = await database.sql`SELECT founding_member FROM users WHERE id = ${hundredthBody.user.id}`;
      expect(hundredthRow.founding_member).toBe(true);

      const hundredFirst = await registerHandler(registerRequest("hundredfirst@example.com", "correcthorse123", "10.0.0.3"));
      const hundredFirstBody = await jsonBody<{ user: { id: string } }>(hundredFirst);
      const [hundredFirstRow] = await database.sql`SELECT founding_member FROM users WHERE id = ${hundredFirstBody.user.id}`;
      expect(hundredFirstRow.founding_member).toBe(false);
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
