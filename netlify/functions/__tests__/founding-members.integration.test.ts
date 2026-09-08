import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import handler from "../founding-members.mts";

const URL = "https://app.tasketra.com/api/founding-members";

describe("founding-members", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    delete process.env.ADMIN_EMAIL;
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
  });

  it("rejects an unauthenticated request", async () => {
    const res = await handler(new Request(URL));
    expect(res.status).toBe(401);
  });

  it("lists founding members ordered by signup date, excluding non-founding users", async () => {
    const first = await createTestUser("first-founding@example.com", { foundingMember: true });
    await createTestUser("second-founding@example.com", { foundingMember: true });
    await createTestUser("not-founding@example.com", { foundingMember: false });

    const res = await handler(asUser(first, { method: "GET", url: URL }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ members: { email: string }[] }>(res);
    expect(body.members.map((m) => m.email)).toEqual(["first-founding@example.com", "second-founding@example.com"]);
  });

  it("includes name, job title, and signup date for each member", async () => {
    const admin = await createTestUser("admin2@example.com", { foundingMember: true });
    const res = await handler(asUser(admin, { method: "GET", url: URL }));
    const body = await jsonBody<{
      members: { email: string; display_name: string | null; job_title: string | null; created_at: string }[];
    }>(res);
    expect(body.members[0]).toMatchObject({ email: "admin2@example.com" });
    expect(body.members[0]).toHaveProperty("display_name");
    expect(body.members[0]).toHaveProperty("job_title");
    expect(body.members[0]).toHaveProperty("created_at");
  });

  it("rejects a non-admin user once ADMIN_EMAIL is set, allows the admin", async () => {
    const owner = await createTestUser("owner@example.com", { foundingMember: true });
    const someoneElse = await createTestUser("someone-else@example.com", { foundingMember: true });
    process.env.ADMIN_EMAIL = "owner@example.com";

    const forbidden = await handler(asUser(someoneElse, { method: "GET", url: URL }));
    expect(forbidden.status).toBe(403);

    const allowed = await handler(asUser(owner, { method: "GET", url: URL }));
    expect(allowed.status).toBe(200);
  });

  it("rejects non-GET methods", async () => {
    const res = await handler(new Request(URL, { method: "POST" }));
    expect(res.status).toBe(405);
  });
});
