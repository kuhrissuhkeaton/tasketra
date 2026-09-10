import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../account.mts";

const URL = "https://app.tasketra.com/api/account";

describe("account -- complete-tour", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await handler(new Request(URL, { method: "PATCH", body: JSON.stringify({ action: "complete-tour" }) }));
    expect(res.status).toBe(401);
  });

  it("sets tour_completed_at for the requesting user only", async () => {
    const user = await createTestUser("tour-user@example.com");
    const other = await createTestUser("tour-other@example.com");

    const res = await handler(asUser(user, { method: "PATCH", url: URL, body: { action: "complete-tour" } }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ ok: true }>(res);
    expect(body.ok).toBe(true);

    const database = db();
    const [updated] = await database.sql<{ tour_completed_at: string | null }>`
      SELECT tour_completed_at FROM users WHERE id = ${user.id}
    `;
    expect(updated.tour_completed_at).not.toBeNull();

    const [untouched] = await database.sql<{ tour_completed_at: string | null }>`
      SELECT tour_completed_at FROM users WHERE id = ${other.id}
    `;
    expect(untouched.tour_completed_at).toBeNull();
  });

  it("is idempotent -- calling it again just updates the timestamp", async () => {
    const user = await createTestUser("tour-repeat@example.com");
    const first = await handler(asUser(user, { method: "PATCH", url: URL, body: { action: "complete-tour" } }));
    expect(first.status).toBe(200);
    const second = await handler(asUser(user, { method: "PATCH", url: URL, body: { action: "complete-tour" } }));
    expect(second.status).toBe(200);
  });
});
