import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../founding-me.mts";

const URL = "https://app.tasketra.com/api/founding-me";

describe("founding-me", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("rejects an unauthenticated request", async () => {
    const res = await handler(new Request(URL));
    expect(res.status).toBe(401);
  });

  it("is for founding members only", async () => {
    const user = await createTestUser("plain@example.com", { foundingMember: false });
    const res = await handler(asUser(user, { method: "GET", url: URL }));
    expect(res.status).toBe(403);
  });

  it("returns the member's number, date, cap and a wall opt-in that defaults to off", async () => {
    const user = await createTestUser("f1@example.com", { foundingMember: true });
    await db().sql`UPDATE users SET founding_number = 7, founding_at = now() WHERE id = ${user.id}`;
    const res = await handler(asUser(user, { method: "GET", url: URL }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ number: number; since: string; cap: number; wallOptIn: boolean }>(res);
    expect(body.number).toBe(7);
    expect(body.since).toBeTruthy();
    expect(body.cap).toBeGreaterThan(0);
    expect(body.wallOptIn).toBe(false);
  });

  it("PATCH turns the wall opt-in on and off", async () => {
    const user = await createTestUser("f2@example.com", { foundingMember: true });
    const on = await handler(asUser(user, { method: "PATCH", url: URL, body: { wallOptIn: true } }));
    expect(on.status).toBe(200);
    expect((await jsonBody<{ wallOptIn: boolean }>(on)).wallOptIn).toBe(true);
    const [row] = await db().sql`SELECT founding_wall_opt_in FROM users WHERE id = ${user.id}`;
    expect(row.founding_wall_opt_in).toBe(true);
    const off = await handler(asUser(user, { method: "PATCH", url: URL, body: { wallOptIn: false } }));
    expect((await jsonBody<{ wallOptIn: boolean }>(off)).wallOptIn).toBe(false);
  });

  it("PATCH rejects a value that is not true or false", async () => {
    const user = await createTestUser("f3@example.com", { foundingMember: true });
    const res = await handler(asUser(user, { method: "PATCH", url: URL, body: { wallOptIn: "yes" } }));
    expect(res.status).toBe(400);
  });

  it("rejects other methods", async () => {
    const user = await createTestUser("f4@example.com", { foundingMember: true });
    const res = await handler(asUser(user, { method: "POST", url: URL }));
    expect(res.status).toBe(405);
  });
});
