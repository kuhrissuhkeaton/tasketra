import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../account-delete.mts";

const URL = "https://app.tasketra.com/api/account-delete";
const PASSWORD = "irrelevant-for-these-tests-123";
const post = (user: { cookie: string }, body: unknown) => handler(asUser(user, { method: "POST", url: URL, body }));
const userCount = async (id: string) => (await db().sql`SELECT count(*)::int AS n FROM users WHERE id = ${id}`)[0].n as number;

describe("account-delete", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); delete process.env.ADMIN_EMAIL; });
  afterEach(() => { delete process.env.ADMIN_EMAIL; });

  it("rejects signed-out requests and other methods", async () => {
    expect((await handler(new Request(URL, { method: "POST" }))).status).toBe(401);
    const user = await createTestUser("m@example.com");
    expect((await handler(asUser(user, { method: "GET", url: URL }))).status).toBe(405);
  });

  it("rejects a wrong password and leaves the account alone", async () => {
    const user = await createTestUser("pw@example.com");
    const res = await post(user, { password: "wrong-password-123", confirmEmail: user.email });
    expect(res.status).toBe(400);
    expect(await userCount(user.id)).toBe(1);
  });

  it("rejects a mistyped email and leaves the account alone", async () => {
    const user = await createTestUser("typed@example.com");
    const res = await post(user, { password: PASSWORD, confirmEmail: "other@example.com" });
    expect(res.status).toBe(400);
    expect(await userCount(user.id)).toBe(1);
  });

  it("deletes the account and its projects, signs out, and logs anonymously", async () => {
    const user = await createTestUser("gone@example.com");
    const bystander = await createTestUser("stays@example.com");
    await createTestProject(user.id, "Mine");
    const other = await createTestProject(bystander.id, "Not mine");

    const res = await post(user, { password: PASSWORD, confirmEmail: `  ${user.email.toUpperCase()} ` });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("tasketra_session=");
    expect(await userCount(user.id)).toBe(0);
    const mine = await db().sql`SELECT count(*)::int AS n FROM projects WHERE owner_id = ${user.id}`;
    expect(mine[0].n).toBe(0);
    const stays = await db().sql`SELECT count(*)::int AS n FROM projects WHERE id = ${other.id}`;
    expect(stays[0].n).toBe(1);

    const log = await db().sql`SELECT action, admin_user_id, target_user_id, target_email, details FROM admin_actions WHERE action = 'self_delete_account'`;
    expect(log).toHaveLength(1);
    expect(log[0].admin_user_id).toBeNull();
    expect(log[0].target_user_id).toBeNull();
    expect(log[0].target_email).toBeNull();
    expect(log[0].details.projects).toBe(1);
  });

  it("is blocked while a project has other people on it", async () => {
    const user = await createTestUser("owner@example.com");
    const teammate = await createTestUser("mate@example.com");
    const project = await createTestProject(user.id, "Shared");
    await db().sql`INSERT INTO project_members (project_id, user_id, invited_email, status) VALUES (${project.id}, ${teammate.id}, ${teammate.email}, 'active')`;
    const res = await post(user, { password: PASSWORD, confirmEmail: user.email });
    expect(res.status).toBe(409);
    expect((await jsonBody<{ error: string }>(res)).error).toContain("other people");
    expect(await userCount(user.id)).toBe(1);
  });

  it("is blocked while a subscription is live", async () => {
    const user = await createTestUser("paid@example.com");
    await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, status) VALUES (${user.id}, 'cus_test_123', 'active')`;
    const res = await post(user, { password: PASSWORD, confirmEmail: user.email });
    expect(res.status).toBe(409);
    expect((await jsonBody<{ error: string }>(res)).error).toContain("subscription");
    expect(await userCount(user.id)).toBe(1);
  });

  it("never lets the admin account delete itself here", async () => {
    const admin = await createTestUser("admin@example.com");
    process.env.ADMIN_EMAIL = "admin@example.com";
    const res = await post(admin, { password: PASSWORD, confirmEmail: admin.email });
    expect(res.status).toBe(409);
    expect(await userCount(admin.id)).toBe(1);
  });
});
