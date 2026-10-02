import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { asUser, createTestUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import { canCreateProject, getUserPlan } from "../../lib/billing.ts";

const stripeMock = { webhooks: { constructEvent: (raw: string, sig: string, secret: string) => Stripe.webhooks.constructEvent(raw, sig, secret) }, subscriptions: { list: vi.fn() }, customers: { create: vi.fn() }, checkout: { sessions: { create: vi.fn() } } };
vi.mock("../../lib/stripe.ts", () => ({ stripe: () => stripeMock }));

import webhookHandler from "../stripe-webhook.mts";
import checkoutHandler from "../create-checkout-session.mts";
import billingStatusHandler from "../billing-status.mts";

const SECRET = "whsec_hardening_tests";
let evtCounter = 0;

function sub(userId: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "sub_h1", object: "subscription", customer: "cus_h1", status, cancel_at_period_end: false,
    metadata: { userId }, trial_end: null,
    items: { data: [{ price: { recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
    ...extra,
  };
}
function event(type: string, object: unknown, created = Math.floor(Date.now() / 1000), id?: string) {
  evtCounter += 1;
  return { id: id ?? `evt_h_${evtCounter}`, object: "event", type, created, data: { object } };
}
function signed(payload: object) {
  const raw = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: SECRET });
  return webhookHandler(new Request("https://tasketra.com/api/stripe-webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: raw }));
}

describe("billing hardening", () => {
  let sent: { to: string; subject: string; text: string }[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    await setupTestDb();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });
  beforeEach(async () => {
    await resetTestDb();
    sent = [];
    process.env.RESEND_API_KEY = "k";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.STRIPE_PRICE_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_ANNUAL = "price_y";
    globalThis.fetch = vi.fn(async (_u: any, init: any) => {
      const b = JSON.parse(init.body);
      sent.push({ to: b.to, subject: b.subject, text: b.text });
      return new Response("{}", { status: 200 });
    }) as any;
    stripeMock.subscriptions.list.mockReset();
    stripeMock.customers.create.mockReset().mockResolvedValue({ id: "cus_new" });
    stripeMock.checkout.sessions.create.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of ["RESEND_API_KEY", "ADMIN_EMAIL", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_ANNUAL"]) delete process.env[k];
  });

  describe("webhook", () => {
    it("stores every Stripe status, including unpaid, paused and incomplete_expired", async () => {
      const user = await createTestUser("statuses@example.com");
      for (const status of ["unpaid", "paused", "incomplete_expired", "incomplete", "past_due"]) {
        const res = await signed(event("customer.subscription.updated", sub(user.id, status)));
        expect(res.status).toBe(200);
        const [row] = await db().sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
        expect(row.status).toBe(status);
      }
    });

    it("keeps Pro through a failed payment, then Free once the grace period is over", async () => {
      const user = await createTestUser("pastdue@example.com");
      await signed(event("customer.subscription.updated", sub(user.id, "past_due")));
      expect(await getUserPlan(db(), user.id)).toBe("past_due");
      // the grace clock starts at the first failure and is not reset by later past_due events
      const [first] = await db().sql`SELECT past_due_since FROM subscriptions WHERE user_id = ${user.id}`;
      await signed(event("customer.subscription.updated", sub(user.id, "past_due")));
      const [second] = await db().sql`SELECT past_due_since FROM subscriptions WHERE user_id = ${user.id}`;
      expect(new Date(second.past_due_since).getTime()).toBe(new Date(first.past_due_since).getTime());

      await db().sql`UPDATE subscriptions SET past_due_since = now() - interval '15 days' WHERE user_id = ${user.id}`;
      expect(await getUserPlan(db(), user.id)).toBe("free");

      await signed(event("customer.subscription.updated", sub(user.id, "active")));
      expect(await getUserPlan(db(), user.id)).toBe("active");
      const [row] = await db().sql`SELECT past_due_since FROM subscriptions WHERE user_id = ${user.id}`;
      expect(row.past_due_since).toBeNull();
    });

    it("ignores a late, older event instead of overwriting newer state", async () => {
      const user = await createTestUser("order@example.com");
      const now = Math.floor(Date.now() / 1000);
      await signed(event("customer.subscription.updated", sub(user.id, "active"), now));
      await signed(event("customer.subscription.updated", sub(user.id, "trialing"), now - 600));
      const [row] = await db().sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
      expect(row.status).toBe("active");
      // and a late 'deleted' from before the current state does not cancel it
      await signed(event("customer.subscription.deleted", { id: "sub_h1", object: "subscription" }, now - 600));
      const [row2] = await db().sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
      expect(row2.status).toBe("active");
    });

    it("handles a repeated event id only once", async () => {
      const user = await createTestUser("dupe@example.com");
      const e = event("customer.subscription.updated", sub(user.id, "active"), undefined, "evt_same");
      await signed(e);
      await db().sql`UPDATE subscriptions SET status = 'canceled' WHERE user_id = ${user.id}`;
      const again = await jsonBody<{ duplicate?: boolean }>(await signed(e));
      expect(again.duplicate).toBe(true);
      const [row] = await db().sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
      expect(row.status).toBe("canceled");
    });

    it("emails once about a failed payment, and again only after it recovers and fails anew", async () => {
      const user = await createTestUser("failed@example.com");
      await signed(event("customer.subscription.updated", sub(user.id, "active")));
      const invoice = { id: "in_1", object: "invoice", customer: "cus_h1" };
      await signed(event("invoice.payment_failed", invoice));
      await signed(event("invoice.payment_failed", invoice));
      const toUser = sent.filter((m) => m.to === "failed@example.com");
      expect(toUser).toHaveLength(1);
      expect(toUser[0].text).toContain("/app/billing");
      expect(sent.filter((m) => m.to === "admin@example.com")).toHaveLength(1);

      await signed(event("customer.subscription.updated", sub(user.id, "active")));
      await signed(event("invoice.payment_failed", invoice));
      expect(sent.filter((m) => m.to === "failed@example.com")).toHaveLength(2);
    });

    it("sends a trial-ending reminder with the price and date", async () => {
      const user = await createTestUser("trial-end@example.com");
      const end = Math.floor(Date.now() / 1000) + 3 * 86400;
      await signed(event("customer.subscription.trial_will_end", sub(user.id, "trialing", { trial_end: end })));
      const mail = sent.find((m) => m.to === "trial-end@example.com")!;
      expect(mail.subject).toContain("trial");
      expect(mail.text).toContain("$29 per month");
    });

    it("alerts the admin on a refund or a dispute", async () => {
      const user = await createTestUser("refund@example.com");
      await signed(event("customer.subscription.updated", sub(user.id, "active")));
      await signed(event("charge.refunded", { id: "ch_1", customer: "cus_h1" }));
      await signed(event("charge.dispute.created", { id: "dp_1", customer: "cus_h1" }));
      const alerts = sent.filter((m) => m.to === "admin@example.com");
      expect(alerts).toHaveLength(2);
      expect(alerts[0].text).toContain("refund@example.com");
    });
  });

  describe("checkout", () => {
    const post = (user: { cookie: string }, interval = "month") =>
      checkoutHandler(asUser(user, { method: "POST", url: "https://app.tasketra.com/api/create-checkout-session", body: { interval } }));

    it("gives a first-time customer the trial, the right return page and renewal wording", async () => {
      const user = await createTestUser("first@example.com");
      stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
      const res = await post(user);
      expect(res.status).toBe(200);
      const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(args.subscription_data.trial_period_days).toBe(14);
      expect(args.success_url).toContain("/app/billing?billing=success");
      expect(args.cancel_url).toContain("/app/billing?billing=canceled");
      expect(args.custom_text.submit.message).toContain("14-day trial");
      expect(args.custom_text.submit.message).toContain("/legal/terms");
    });

    it("gives no second trial to someone who has subscribed before", async () => {
      const user = await createTestUser("again@example.com");
      await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) VALUES (${user.id}, 'cus_old', 'sub_old', 'canceled')`;
      stripeMock.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_old", status: "canceled" }] });
      await post(user, "year");
      const args = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(args.subscription_data.trial_period_days).toBeUndefined();
      expect(args.custom_text.submit.message).toContain("$290 per year");
      expect(args.custom_text.submit.message).not.toContain("trial is free");
    });

    it("refuses a second checkout while a subscription is still live, including past_due", async () => {
      const user = await createTestUser("double@example.com");
      await db().sql`INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status) VALUES (${user.id}, 'cus_d', 'sub_d', 'past_due')`;
      for (const status of ["past_due", "unpaid", "paused", "active", "trialing", "incomplete"]) {
        stripeMock.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_d", status }] });
        const res = await post(user);
        expect(res.status).toBe(409);
        expect((await jsonBody<{ usePortal: boolean }>(res)).usePortal).toBe(true);
      }
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });
  });

  describe("limits and billing status", () => {
    it("closed projects don't count toward the free project limit", async () => {
      const user = await createTestUser("closed@example.com");
      for (let i = 0; i < 3; i++) {
        await db().sql`INSERT INTO projects (name, owner_id, closed_at) VALUES (${"P" + i}, ${user.id}, now())`;
      }
      expect(await canCreateProject(db(), user.id)).toBe(true);
      for (let i = 0; i < 3; i++) await db().sql`INSERT INTO projects (name, owner_id) VALUES (${"Open" + i}, ${user.id})`;
      expect(await canCreateProject(db(), user.id)).toBe(false);
    });

    it("billing-status reports dates, the grace end and whether a trial is still on offer", async () => {
      const user = await createTestUser("status@example.com");
      const get = () => billingStatusHandler(asUser(user, { method: "GET", url: "https://app.tasketra.com/api/billing-status" }));
      expect((await jsonBody<{ canStartTrial: boolean; plan: string }>(await get()))).toMatchObject({ plan: "free", canStartTrial: true });

      await signed(event("customer.subscription.updated", sub(user.id, "past_due", { id: "sub_h1" })));
      const body = await jsonBody<{ plan: string; graceEndsAt: string; canStartTrial: boolean }>(await get());
      expect(body.plan).toBe("past_due");
      expect(body.graceEndsAt).toBeTruthy();
      expect(body.canStartTrial).toBe(false);
    });
  });
});
