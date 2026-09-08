import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import statusHandler from "../founding-status.mts";
import registerHandler from "../auth-register.mts";
import { db } from "../../lib/db.ts";
import { jsonBody } from "./fixtures.ts";

function statusRequest() {
  return new Request("https://app.tasketra.com/api/founding-status");
}

function registerRequest(email: string, ip: string) {
  return new Request("https://tasketra.com/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip },
    body: JSON.stringify({ email, password: "correcthorse123" }),
  });
}

describe("founding-status", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reports zero claimed and not full with no users yet", async () => {
    const res = await statusHandler(statusRequest());
    const body = await jsonBody<{ cap: number; claimed: number; remaining: number; full: boolean }>(res);
    expect(body).toEqual({ cap: 100, claimed: 0, remaining: 100, full: false });
  });

  it("counts real founding-member signups, not total accounts", async () => {
    await registerHandler(registerRequest("a@example.com", "10.0.1.1"));
    await registerHandler(registerRequest("b@example.com", "10.0.1.2"));
    const res = await statusHandler(statusRequest());
    const body = await jsonBody<{ claimed: number; remaining: number; full: boolean }>(res);
    expect(body.claimed).toBe(2);
    expect(body.remaining).toBe(98);
    expect(body.full).toBe(false);
  });

  it("reports full once 100 founding members exist", async () => {
    const database = db();
    for (let i = 0; i < 100; i++) {
      await database.sql`
        INSERT INTO users (email, password_hash, founding_member) VALUES (${`seed${i}@example.com`}, 'x', true)
      `;
    }
    const res = await statusHandler(statusRequest());
    const body = await jsonBody<{ claimed: number; remaining: number; full: boolean }>(res);
    expect(body).toEqual({ cap: 100, claimed: 100, remaining: 0, full: true });
  });

  it("sends the marketing site's CORS origin and a cache header", async () => {
    const res = await statusHandler(statusRequest());
    expect(res.headers.get("access-control-allow-origin")).toBe("https://tasketra.com");
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  it("rejects non-GET methods", async () => {
    const res = await statusHandler(new Request("https://app.tasketra.com/api/founding-status", { method: "POST" }));
    expect(res.status).toBe(405);
  });
});
