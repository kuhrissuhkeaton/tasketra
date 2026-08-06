import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { stripe } from "../lib/stripe.ts";
import { getSiteUrl } from "../lib/env.ts";

// Hands off to Stripe's own hosted Customer Portal for plan management and
// cancellation -- no custom UI to build, and cancellation genuinely
// self-serve (no support ticket, no email chase) since it's Stripe's own
// flow end to end.

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const [sub] = await database.sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${userId}`;
  if (!sub?.stripe_customer_id) return json({ error: "No billing account found." }, { status: 404 });

  const client = stripe();
  const session = await client.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${getSiteUrl()}/app/billing`,
  });

  return json({ url: session.url });
};

export const config: Config = { path: "/api/create-portal-session" };
