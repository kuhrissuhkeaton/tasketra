import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { getUserPlan, PAST_DUE_GRACE_DAYS } from "../lib/billing.ts";
import { withSentry } from "../lib/sentry.ts";

// What the Billing page shows: plan, renewal or trial dates, and any payment
// problem. Read from our copy of the Stripe subscription; no Stripe call.

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });

  const database = db();
  const plan = await getUserPlan(database, userId);
  const [sub] = await database.sql`
    SELECT status, billing_interval, current_period_end, cancel_at_period_end, trial_end, past_due_since, stripe_subscription_id
    FROM subscriptions WHERE user_id = ${userId}
  `;
  const graceEndsAt =
    plan === "past_due" && sub?.past_due_since
      ? new Date(new Date(sub.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000).toISOString()
      : null;
  return json({
    plan,
    status: sub?.status ?? null,
    interval: sub?.billing_interval ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
    trialEnd: plan === "trialing" ? sub?.trial_end ?? null : null,
    graceEndsAt,
    canStartTrial: !sub?.stripe_subscription_id,
    hasBillingAccount: !!sub,
  });
});

export const config: Config = { path: "/api/billing-status" };
