// Pro plan prices in USD — the single source the Founder Hub (v152) uses
// to derive MRR from the local subscriptions mirror, which stores plan
// interval but no amounts. These match the live Stripe prices behind
// STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL and the display strings in
// create-checkout-session.mts ("$29 per month" / "$290 per year").
// If pricing ever changes (or a coupon/grandfathered rate appears), this
// is the second place that has to change — see V152_SPEC.md Flag D4.
export const PRO_MONTHLY_USD = 29;
export const PRO_ANNUAL_USD = 290;

/** Monthly-recurring-revenue contribution of one subscription. */
export function mrrContributionUsd(status: string | null, billingInterval: string | null): number {
  // Trialing counts $0 (no money has moved); past_due counts in full (the
  // relationship is still paying, inside its grace period) and is broken
  // out separately wherever "at risk" matters.
  if (status !== "active" && status !== "past_due") return 0;
  return billingInterval === "year" ? PRO_ANNUAL_USD / 12 : PRO_MONTHLY_USD;
}
