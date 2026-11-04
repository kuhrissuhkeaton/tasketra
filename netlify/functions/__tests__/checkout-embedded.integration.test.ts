import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { asUser, createTestUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";

// v148: embedded checkout. Same endpoint, same guards; with ui: "embedded"
// the session is created with ui_mode + return_url (no success/cancel URLs)
// and the response carries the client secret + publishable key instead of a
// hosted url. The Stripe mock mirrors billing-hardening's harness.
const stripeMock = { subscriptions: { list: vi.fn() }, customers: { create: vi.fn() }, checkout: { sessions: { create: vi.fn() } } };
vi.mock("../../lib/stripe.ts", () => ({ stripe: () => stripeMock }));

import checkoutHandler from "../create-checkout-session.mts";

describe("embedded checkout session", () => {
  beforeAll(async () => {
    await setupTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
    delete process.env.STRIPE_SECRET_KEY;
  });
  beforeEach(async () => {
    await resetTestDb();
    process.env.STRIPE_PRICE_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_ANNUAL = "price_y";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    stripeMock.subscriptions.list.mockReset().mockResolvedValue({ data: [] });
    stripeMock.customers.create.mockReset().mockResolvedValue({ id: "cus_new" });
    stripeMock.checkout.sessions.create.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/s", client_secret: "cs_test_secret_123" });
  });
  afterEach(() => {
    for (const k of ["STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_ANNUAL", "STRIPE_PUBLISHABLE_KEY"]) delete process.env[k];
  });

  const post = (user: { cookie: string }, body: Record<string, unknown>) =>
    checkoutHandler(asUser(user, { method: "POST", url: "https://app.tasketra.com/api/create-checkout-session", body }));

  it("embedded: returns clientSecret + publishableKey and creates the session with ui_mode and return_url only", async () => {
    const user = await createTestUser("embedded@example.com");
    const res = await post(user, { interval: "month", ui: "embedded" });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ clientSecret: string; publishableKey: string; url?: string }>(res);
    expect(body.clientSecret).toBe("cs_test_secret_123");
    expect(body.publishableKey).toBe("pk_test_123");
    expect(body.url).toBeUndefined();

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.ui_mode).toBe("embedded");
    expect(args.return_url).toContain("/app/billing?billing=success");
    expect(args.success_url).toBeUndefined();
    expect(args.cancel_url).toBeUndefined();
    // the shared parts are untouched: customer, mode, price, trial, wording
    expect(args.customer).toBe("cus_new");
    expect(args.mode).toBe("subscription");
    expect(args.line_items).toEqual([{ price: "price_m", quantity: 1 }]);
    expect(args.subscription_data.trial_period_days).toBe(14);
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.custom_text.submit.message).toContain("14-day trial");
  });

  it("embedded without STRIPE_PUBLISHABLE_KEY is a 500 and creates no session", async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const user = await createTestUser("nokey@example.com");
    const res = await post(user, { interval: "year", ui: "embedded" });
    expect(res.status).toBe(500);
    expect((await jsonBody<{ error: string }>(res)).error).toBe("Billing isn't configured yet.");
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("embedded founding member still gets the 400", async () => {
    const user = await createTestUser("founder@example.com", { foundingMember: true });
    const res = await post(user, { interval: "month", ui: "embedded" });
    expect(res.status).toBe(400);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("embedded with a live subscription still gets the 409 usePortal", async () => {
    const user = await createTestUser("live@example.com");
    await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) VALUES (${user.id}, 'cus_l', 'sub_l', 'active')`;
    stripeMock.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_l", status: "active" }] });
    const res = await post(user, { interval: "month", ui: "embedded" });
    expect(res.status).toBe(409);
    expect((await jsonBody<{ usePortal: boolean }>(res)).usePortal).toBe(true);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("hosted (no ui field) is unchanged: { url } with success and cancel urls, no ui_mode", async () => {
    const user = await createTestUser("hosted@example.com");
    const res = await post(user, { interval: "month" });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ url: string; clientSecret?: string }>(res);
    expect(body.url).toBe("https://checkout.stripe.test/s");
    expect(body.clientSecret).toBeUndefined();

    const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(args.ui_mode).toBeUndefined();
    expect(args.return_url).toBeUndefined();
    expect(args.success_url).toContain("/app/billing?billing=success");
    expect(args.cancel_url).toContain("/app/billing?billing=canceled");
  });
});
