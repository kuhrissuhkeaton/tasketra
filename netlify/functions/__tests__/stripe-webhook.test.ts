import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Stripe from "stripe";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser } from "./fixtures.ts";
import webhookHandler from "../stripe-webhook.mts";
import { db } from "../../lib/db.ts";

// No live Stripe account or network calls needed: signature verification is
// a local HMAC computation against STRIPE_WEBHOOK_SECRET, and
// Stripe.webhooks.generateTestHeaderString is the SDK's own documented way
// to produce a validly-signed test payload. This is the one place a bug
// would mean silently accepting a forged "your subscription is active" event
// from anyone on the internet, so it's tested directly rather than mocked.

const WEBHOOK_SECRET = "whsec_test_secret_for_integration_tests";

function subscriptionUpdatedPayload(userId: string, status: string, cancelAtPeriodEnd = false) {
  return {
    id: "evt_test_1",
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        customer: "cus_test_1",
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        metadata: { userId },
        items: { data: [{ price: { recurring: { interval: "month" } }, current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] },
      },
    },
  };
}

function signedRequest(payload: object): Request {
  const rawBody = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: WEBHOOK_SECRET });
  return new Request("https://tasketra.com/api/stripe-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: rawBody,
  });
}

describe("stripe-webhook signature verification", () => {
  beforeAll(async () => {
    await setupTestDb();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key_never_called";
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a correctly-signed event and mirrors subscription state into the DB", async () => {
    const user = await createTestUser("stripe-user@example.com");
    const res = await webhookHandler(signedRequest(subscriptionUpdatedPayload(user.id, "active")));
    expect(res.status).toBe(200);

    const database = db();
    const [row] = await database.sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
    expect(row.status).toBe("active");
  });

  it("rejects a request with no stripe-signature header at all", async () => {
    const rawBody = JSON.stringify(subscriptionUpdatedPayload("whatever", "active"));
    const res = await webhookHandler(
      new Request("https://tasketra.com/api/stripe-webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
      })
    );
    expect(res.status).toBe(500); // "Webhook not configured" -- no signature means nothing to verify against
  });

  it("rejects a tampered payload even with a validly-formed signature header from a different payload", async () => {
    const user = await createTestUser("tamper-user@example.com");
    const originalPayload = subscriptionUpdatedPayload(user.id, "active");
    const rawBody = JSON.stringify(originalPayload);
    const header = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: WEBHOOK_SECRET });

    // Same signature header, but the body was changed after signing --
    // exactly what an attacker replaying/modifying a captured payload would do.
    const tamperedBody = JSON.stringify(subscriptionUpdatedPayload(user.id, "canceled"));
    const res = await webhookHandler(
      new Request("https://tasketra.com/api/stripe-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": header },
        body: tamperedBody,
      })
    );
    expect(res.status).toBe(400);

    const database = db();
    const rows = await database.sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
    expect(rows.length).toBe(0); // nothing was written
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const rawBody = JSON.stringify(subscriptionUpdatedPayload("whatever", "active"));
    const wrongHeader = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: "whsec_totally_different_secret" });
    const res = await webhookHandler(
      new Request("https://tasketra.com/api/stripe-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": wrongHeader },
        body: rawBody,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a stale signature outside Stripe's tolerance window", async () => {
    const user = await createTestUser("stale-user@example.com");
    const rawBody = JSON.stringify(subscriptionUpdatedPayload(user.id, "active"));
    // 10 minutes old -- Stripe's SDK default tolerance is 5 minutes.
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
    const header = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: WEBHOOK_SECRET, timestamp: staleTimestamp });
    const res = await webhookHandler(
      new Request("https://tasketra.com/api/stripe-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": header },
        body: rawBody,
      })
    );
    expect(res.status).toBe(400);
  });

  it("marks a subscription canceled on customer.subscription.deleted", async () => {
    const user = await createTestUser("cancel-user@example.com");
    // Seed an active subscription first (via a signed 'updated' event, exercising the real path).
    await webhookHandler(signedRequest(subscriptionUpdatedPayload(user.id, "active")));

    const deletedPayload = {
      id: "evt_test_2",
      object: "event",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_test_1", object: "subscription" } },
    };
    const res = await webhookHandler(signedRequest(deletedPayload));
    expect(res.status).toBe(200);

    const database = db();
    const [row] = await database.sql`SELECT status FROM subscriptions WHERE user_id = ${user.id}`;
    expect(row.status).toBe("canceled");
  });

  it("marks cancellation_notified_at when cancel_at_period_end first flips to true", async () => {
    const user = await createTestUser("exit-notify-user@example.com");
    await webhookHandler(signedRequest(subscriptionUpdatedPayload(user.id, "active", false)));

    const database = db();
    let [row] = await database.sql`SELECT cancellation_notified_at FROM subscriptions WHERE user_id = ${user.id}`;
    expect(row.cancellation_notified_at).toBeNull();

    const res = await webhookHandler(
      signedRequest({
        id: "evt_test_cancel",
        object: "event",
        type: "customer.subscription.updated",
        data: { object: subscriptionUpdatedPayload(user.id, "active", true).data.object },
      })
    );
    expect(res.status).toBe(200);

    [row] = await database.sql`SELECT cancellation_notified_at FROM subscriptions WHERE user_id = ${user.id}`;
    expect(row.cancellation_notified_at).not.toBeNull();
  });

  it("does not re-notify on a second webhook event while still canceling", async () => {
    const user = await createTestUser("exit-notify-dedupe@example.com");
    await webhookHandler(signedRequest(subscriptionUpdatedPayload(user.id, "active", false)));
    await webhookHandler(
      signedRequest({
        id: "evt_test_cancel_a",
        object: "event",
        type: "customer.subscription.updated",
        data: { object: subscriptionUpdatedPayload(user.id, "active", true).data.object },
      })
    );

    const database = db();
    const [first] = await database.sql`SELECT cancellation_notified_at FROM subscriptions WHERE user_id = ${user.id}`;
    const firstNotifiedAt = first.cancellation_notified_at;
    expect(firstNotifiedAt).not.toBeNull();

    // A second unrelated update event, still canceling -- should not re-trigger.
    await webhookHandler(
      signedRequest({
        id: "evt_test_cancel_b",
        object: "event",
        type: "customer.subscription.updated",
        data: { object: subscriptionUpdatedPayload(user.id, "active", true).data.object },
      })
    );

    const [second] = await database.sql`SELECT cancellation_notified_at FROM subscriptions WHERE user_id = ${user.id}`;
    expect(second.cancellation_notified_at.getTime()).toBe(firstNotifiedAt.getTime());
  });
});
