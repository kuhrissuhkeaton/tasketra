import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { stripe } from "../lib/stripe.ts";
import { getEnv } from "../lib/env.ts";
import type Stripe from "stripe";

// Single entry point for all subscription state changes. Never trusts the
// client for billing state -- Stripe is the source of truth, this just
// mirrors it into `subscriptions` so the rest of the app can read plan
// status with a plain SQL query instead of calling Stripe on every request.

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return json({ error: "Webhook not configured" }, { status: 500 });

  const rawBody = await req.text();
  const client = stripe();

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Signature verification failed -- reject rather than trust an
    // unverified payload. This is the only thing standing between this
    // endpoint and anyone on the internet POSTing fake "subscription active"
    // events.
    return json({ error: "Invalid signature" }, { status: 400 });
  }

  const database = db();

  async function upsertFromSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.userId;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const interval = sub.items.data[0]?.price?.recurring?.interval || null;
    const periodEnd = sub.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null;

    if (userId) {
      await database.sql`
        INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, billing_interval, current_period_end, cancel_at_period_end)
        VALUES (${userId}, ${customerId}, ${sub.id}, ${sub.status}, ${interval}, ${periodEnd}, ${sub.cancel_at_period_end})
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          status = EXCLUDED.status,
          billing_interval = EXCLUDED.billing_interval,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          updated_at = now()
      `;
    } else {
      // Fallback for events where metadata.userId wasn't carried through
      // (shouldn't happen given create-checkout-session always sets it, but
      // don't silently drop a real status change if it does).
      await database.sql`
        UPDATE subscriptions SET
          stripe_subscription_id = ${sub.id}, status = ${sub.status}, billing_interval = ${interval},
          current_period_end = ${periodEnd}, cancel_at_period_end = ${sub.cancel_at_period_end}, updated_at = now()
        WHERE stripe_customer_id = ${customerId}
      `;
    }
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await client.subscriptions.retrieve(subId);
        await upsertFromSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await database.sql`UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE stripe_subscription_id = ${sub.id}`;
      break;
    }
    default:
      break;
  }

  return json({ received: true });
};

export const config: Config = { path: "/api/stripe-webhook" };
