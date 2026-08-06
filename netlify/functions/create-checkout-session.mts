import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { stripe } from "../lib/stripe.ts";
import { getSiteUrl, getEnv } from "../lib/env.ts";
import { withSentry } from "../lib/sentry.ts";

// Starts a Stripe Checkout session for the flat-rate Tasketra Pro plan.
// 14-day trial on both intervals; Stripe handles the actual card entry,
// so no payment data ever touches our servers.

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null) as any;
  const interval = body?.interval === "year" ? "year" : "month";

  const priceId = interval === "year" ? getEnv("STRIPE_PRICE_ANNUAL") : getEnv("STRIPE_PRICE_MONTHLY");
  if (!priceId) return json({ error: "Billing isn't configured yet." }, { status: 500 });

  const database = db();
  const [user] = await database.sql`SELECT email, founding_member FROM users WHERE id = ${userId}`;
  if (!user) return json({ error: "Not found" }, { status: 404 });
  if (user.founding_member) return json({ error: "Founding members already have Pro access for free." }, { status: 400 });

  const client = stripe();

  // Reuse an existing Stripe customer for this user rather than creating a
  // new one on every checkout attempt (e.g. if they abandon checkout once).
  const [existing] = await database.sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${userId}`;
  let customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await client.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await database.sql`
      INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES (${userId}, ${customerId})
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
    `;
  }

  const siteUrl = getSiteUrl();
  const session = await client.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: 14, metadata: { userId } },
    success_url: `${siteUrl}/app?billing=success`,
    cancel_url: `${siteUrl}/app?billing=canceled`,
    allow_promotion_codes: true,
  });

  return json({ url: session.url });
});

export const config: Config = { path: "/api/create-checkout-session" };
