import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { stripe } from "../lib/stripe.ts";
import { getEnv, getSiteUrl } from "../lib/env.ts";
import { sendEmail } from "../lib/notify.ts";
import type Stripe from "stripe";
import { withSentry } from "../lib/sentry.ts";

// Single entry point for all subscription state changes. Never trusts the
// client for billing state -- Stripe is the source of truth, this just
// mirrors it into `subscriptions` so the rest of the app can read plan
// status with a plain SQL query instead of calling Stripe on every request.

export default withSentry(async (req: Request) => {
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

  // Stripe retries and occasionally repeats events; handle each id once.
  const [seen] = await database.sql`SELECT id FROM stripe_events WHERE id = ${event.id}`;
  if (seen) return json({ received: true, duplicate: true });

  // When Stripe created this event. Older events must not overwrite newer state.
  const eventAt = new Date(((event as any).created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  async function upsertFromSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.userId;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const interval = sub.items.data[0]?.price?.recurring?.interval || null;
    const periodEnd = sub.items.data[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null;

    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    const pastDueNow = sub.status === "past_due" ? new Date().toISOString() : null;

    if (userId) {
      // past_due_since keeps its original value while the status stays past_due
      // (the grace period counts from the first failure); it clears once the
      // status moves on, and so does the "we emailed about this failure" mark.
      await database.sql`
        INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, billing_interval, current_period_end, cancel_at_period_end, past_due_since, trial_end, last_event_at)
        VALUES (${userId}, ${customerId}, ${sub.id}, ${sub.status}, ${interval}, ${periodEnd}, ${sub.cancel_at_period_end}, ${pastDueNow}, ${trialEnd}, ${eventAt})
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          status = EXCLUDED.status,
          billing_interval = EXCLUDED.billing_interval,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          past_due_since = CASE
            WHEN EXCLUDED.status = 'past_due' THEN COALESCE(CASE WHEN subscriptions.status = 'past_due' THEN subscriptions.past_due_since END, now())
            ELSE NULL END,
          payment_failed_notified_at = CASE WHEN EXCLUDED.status = 'past_due' THEN subscriptions.payment_failed_notified_at ELSE NULL END,
          trial_end = EXCLUDED.trial_end,
          last_event_at = EXCLUDED.last_event_at,
          updated_at = now()
        WHERE subscriptions.last_event_at IS NULL OR subscriptions.last_event_at <= EXCLUDED.last_event_at
      `;
    } else {
      // Fallback for events where metadata.userId wasn't carried through
      // (shouldn't happen given create-checkout-session always sets it, but
      // don't silently drop a real status change if it does).
      await database.sql`
        UPDATE subscriptions SET
          stripe_subscription_id = ${sub.id}, status = ${sub.status}, billing_interval = ${interval},
          current_period_end = ${periodEnd}, cancel_at_period_end = ${sub.cancel_at_period_end},
          past_due_since = CASE WHEN ${sub.status} = 'past_due' THEN COALESCE(past_due_since, now()) ELSE NULL END,
          trial_end = ${trialEnd}, last_event_at = ${eventAt}, updated_at = now()
        WHERE stripe_customer_id = ${customerId} AND (last_event_at IS NULL OR last_event_at <= ${eventAt})
      `;
    }
  }

  // A cancellation happens entirely inside Stripe's hosted portal -- there's
  // no in-app "cancel" action to hook into. This is the only place that
  // knows it happened, so it's also the only place that can make sure it
  // isn't a silent event: notify the person (asking why, low-pressure,
  // reply-based) and notify the admin (so a cancellation isn't only visible
  // by noticing MRR dropped later).
  async function notifyOnNewCancellation(sub: Stripe.Subscription) {
    if (!sub.cancel_at_period_end) return;
    const userId = sub.metadata?.userId;
    if (!userId) return;

    const [existing] = await database.sql`SELECT cancel_at_period_end, cancellation_notified_at FROM subscriptions WHERE user_id = ${userId}`;
    const wasAlreadyCanceling = existing?.cancel_at_period_end === true;
    const alreadyNotified = !!existing?.cancellation_notified_at;
    if (wasAlreadyCanceling || alreadyNotified) return;

    const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
    if (!user?.email) return;

    const adminEmail = getEnv("ADMIN_EMAIL");
    await sendEmail(
      user.email,
      "Sorry to see you go",
      `Hi,\n\nLooks like you canceled your Tasketra subscription -- it'll stay active through the end of` +
        ` your current billing period, no rush.\n\nMind telling me why? Not asking to talk you out of it,` +
        ` genuinely just want to know what didn't work. Hit reply, one line is plenty.\n\n-- Karissa`,
      adminEmail || undefined
    );
    if (adminEmail) {
      await sendEmail(adminEmail, "A subscription just canceled", `${user.email} just canceled their Tasketra subscription.`);
    }
    await database.sql`UPDATE subscriptions SET cancellation_notified_at = now() WHERE user_id = ${userId}`;
  }

  // Referral reward: "both sides get a free month," applied as a Stripe
  // customer balance credit (negative balance = credit toward the next
  // invoice) rather than an actual transfer of money. Fires once, the
  // moment a referred user's subscription first becomes active (trial ->
  // paid) -- not on every subsequent webhook ping while it stays active.
  // If the referrer never went through checkout (no Stripe customer on
  // file -- e.g. a founding member who's never seen the billing flow),
  // there's nothing to credit them against; the referral is still marked
  // granted so this doesn't retry forever, but only the referee's side
  // actually gets money off in that case.
  async function grantReferralRewardIfNewlyActive(sub: Stripe.Subscription) {
    if (sub.status !== "active") return;
    const userId = sub.metadata?.userId;
    if (!userId) return;

    const [existing] = await database.sql`SELECT status FROM subscriptions WHERE user_id = ${userId}`;
    if (existing?.status === "active") return; // already active before this event -- not a new conversion

    const [user] = await database.sql`SELECT referred_by, referral_reward_granted_at FROM users WHERE id = ${userId}`;
    if (!user?.referred_by || user.referral_reward_granted_at) return;

    const priceId = getEnv("STRIPE_PRICE_MONTHLY");
    if (!priceId) return;
    const price = await client.prices.retrieve(priceId);
    const amountCents = price.unit_amount;
    if (!amountCents) return;

    const refereeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    // Idempotency keys: if this handler fails part-way and Stripe retries the
    // event, a credit that already went through is not given a second time.
    await client.customers.createBalanceTransaction(refereeCustomerId, {
      amount: -amountCents,
      currency: price.currency,
      description: "Referral reward -- one month free for joining through a referral link",
    }, { idempotencyKey: `referral-referee-${userId}` });

    const [referrerSub] = await database.sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${user.referred_by}`;
    if (referrerSub?.stripe_customer_id) {
      await client.customers.createBalanceTransaction(referrerSub.stripe_customer_id, {
        amount: -amountCents,
        currency: price.currency,
        description: "Referral reward -- one month free for a referral that converted to paid",
      }, { idempotencyKey: `referral-referrer-${userId}` });
    }

    await database.sql`UPDATE users SET referral_reward_granted_at = now() WHERE id = ${userId}`;
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
      const sub = event.data.object as Stripe.Subscription;
      await notifyOnNewCancellation(sub);
      await grantReferralRewardIfNewlyActive(sub);
      await upsertFromSubscription(sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await database.sql`
        UPDATE subscriptions SET status = 'canceled', past_due_since = NULL, last_event_at = ${eventAt}, updated_at = now()
        WHERE stripe_subscription_id = ${sub.id} AND (last_event_at IS NULL OR last_event_at <= ${eventAt})
      `;
      break;
    }
    case "invoice.payment_failed": {
      // A renewal charge failed. The subscription.updated event moves the plan to
      // past_due; this tells the person, once per failure, what to do about it.
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;
      const [row] = await database.sql`
        SELECT s.user_id, s.payment_failed_notified_at, u.email
        FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.stripe_customer_id = ${customerId}
      `;
      if (!row || row.payment_failed_notified_at) break;
      await database.sql`UPDATE subscriptions SET payment_failed_notified_at = now() WHERE user_id = ${row.user_id}`;
      const adminEmail = getEnv("ADMIN_EMAIL");
      await sendEmail(
        row.email,
        "Your Tasketra payment didn't go through",
        `Hi,\n\nWe couldn't charge your card for Tasketra Pro. Nothing is lost: you keep Pro for now while we retry,` +
          ` and all your projects stay exactly as they are.\n\nTo fix it, update your card here:\n${getSiteUrl()}/app/billing\n\n` +
          `If it isn't fixed in about two weeks your account moves to the Free plan (your projects are kept).\n\n-- Karissa`,
        adminEmail || undefined
      );
      if (adminEmail) await sendEmail(adminEmail, "A Tasketra payment failed", `A renewal payment failed for ${row.email}.`);
      break;
    }
    case "customer.subscription.trial_will_end": {
      // Stripe sends this about 3 days before a trial ends. A clear reminder
      // before the first charge is expected (and required in some states).
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
      if (!user?.email) break;
      const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
      const amount = interval === "year" ? "$290 per year" : "$29 per month";
      const endsOn = sub.trial_end ? new Date(sub.trial_end * 1000).toUTCString().slice(0, 16) : "soon";
      await sendEmail(
        user.email,
        "Your Tasketra trial ends soon",
        `Hi,\n\nYour free Pro trial ends on ${endsOn}. After that your card is charged ${amount} until you cancel.\n\n` +
          `To keep Pro, you don't need to do anything. To cancel or change your plan, use Manage billing:\n${getSiteUrl()}/app/billing\n\n-- Karissa`,
        getEnv("ADMIN_EMAIL") || undefined
      );
      break;
    }
    case "charge.dispute.created":
    case "charge.refunded": {
      // Money-moving events nobody should find out about later. Alert the admin.
      const adminEmail = getEnv("ADMIN_EMAIL");
      if (!adminEmail) break;
      const obj = event.data.object as any;
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      let who = customerId || "an unknown customer";
      if (customerId) {
        const [row] = await database.sql`
          SELECT u.email FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.stripe_customer_id = ${customerId}
        `;
        if (row?.email) who = row.email;
      }
      const label = event.type === "charge.dispute.created" ? "A payment was disputed" : "A payment was refunded";
      await sendEmail(adminEmail, `Tasketra: ${label.toLowerCase()}`, `${label} for ${who}. Review it in the Stripe Dashboard.`);
      break;
    }
    default:
      break;
  }

  await database.sql`INSERT INTO stripe_events (id, type) VALUES (${event.id}, ${event.type}) ON CONFLICT (id) DO NOTHING`;
  return json({ received: true });
});

export const config: Config = { path: "/api/stripe-webhook" };
