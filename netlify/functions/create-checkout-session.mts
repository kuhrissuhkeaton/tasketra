import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { stripe } from "../lib/stripe.ts";
import { getSiteUrl, getEnv } from "../lib/env.ts";
import { withSentry } from "../lib/sentry.ts";
import { requireVerifiedEmail } from "../lib/emailVerification.ts";
import { LIVE_SUBSCRIPTION_STATUSES } from "../lib/billing.ts";
import { proPriceLabel } from "../../src/lib/pricing.ts";

// Starts a Stripe Checkout session for the flat-rate Tasketra Pro plan.
// 14-day trial on both intervals; Stripe handles the actual card entry,
// so no payment data ever touches our servers.

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  {
    const unverified = await requireVerifiedEmail(db(), userId);
    if (unverified) return unverified;
  }

  const body = await req.json().catch(() => null) as any;
  const interval = body?.interval === "year" ? "year" : "month";
  // Embedded checkout (v148): the payment form renders inside
  // app.tasketra.com instead of redirecting to a hosted Stripe page. Every
  // guard below runs identically for both modes; only session creation
  // branches, at the very end.
  const embedded = body?.ui === "embedded";

  const priceId = interval === "year" ? getEnv("STRIPE_PRICE_ANNUAL") : getEnv("STRIPE_PRICE_MONTHLY");
  if (!priceId) return json({ error: "Billing isn't configured yet." }, { status: 500 });

  const database = db();
  const [user] = await database.sql`SELECT email, founding_member FROM users WHERE id = ${userId}`;
  if (!user) return json({ error: "Not found" }, { status: 404 });
  if (user.founding_member) return json({ error: "Founding members already have Pro access for free." }, { status: 400 });

  const client = stripe();

  // Reuse an existing Stripe customer for this user rather than creating a
  // new one on every checkout attempt (e.g. if they abandon checkout once).
  const [existing] = await database.sql`SELECT stripe_customer_id, stripe_subscription_id FROM subscriptions WHERE user_id = ${userId}`;
  let customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await client.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await database.sql`
      INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES (${userId}, ${customerId})
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
    `;
  }

  // Stripe is the source of truth for what already exists on this customer.
  // A second checkout while one subscription is still live (including one with a
  // failed payment) would bill them twice, so send them to the portal instead.
  const prior = await client.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  if (prior.data.some((s) => LIVE_SUBSCRIPTION_STATUSES.includes(s.status))) {
    return json(
      { error: "You already have a subscription. Use Manage billing to change it or update your card.", usePortal: true },
      { status: 409 }
    );
  }
  // One free trial per person: anyone who has had a subscription before pays
  // from day one.
  const hadSubscriptionBefore = prior.data.some((s) => s.status !== "incomplete_expired") || !!existing?.stripe_subscription_id;
  const price = proPriceLabel(interval);

  const siteUrl = getSiteUrl();
  const shared = {
    customer: customerId,
    mode: "subscription" as const,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { ...(hadSubscriptionBefore ? {} : { trial_period_days: 14 }), metadata: { userId } },
    allow_promotion_codes: true,
    custom_text: {
      submit: {
        message:
          (hadSubscriptionBefore
            ? `Your card is charged ${price} starting today and renews automatically until you cancel.`
            : `Your 14-day trial is free. After it ends your card is charged ${price} and renews automatically until you cancel.`) +
          ` Cancel any time from Billing in Tasketra. By subscribing you agree to the [Terms](${siteUrl}/legal/terms).`,
      },
    },
  };

  if (embedded) {
    // The publishable key is handed to the browser so it can mount the
    // embedded form; without it there is nothing to render, so fail the
    // same way an unconfigured price does (the page offers hosted instead).
    const publishableKey = getEnv("STRIPE_PUBLISHABLE_KEY");
    if (!publishableKey) return json({ error: "Billing isn't configured yet." }, { status: 500 });
    const session = await client.checkout.sessions.create({
      ...shared,
      ui_mode: "embedded_page",
      return_url: `${siteUrl}/app/billing?billing=success`,
    });
    return json({ clientSecret: session.client_secret, publishableKey });
  }

  const session = await client.checkout.sessions.create({
    ...shared,
    success_url: `${siteUrl}/app/billing?billing=success`,
    cancel_url: `${siteUrl}/app/billing?billing=canceled`,
  });

  return json({ url: session.url });
});

export const config: Config = { path: "/api/create-checkout-session" };
