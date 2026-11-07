// Server-side billing price helpers. The amounts themselves live in
// src/lib/pricing.ts (the one source of truth, shared with the app); this
// module re-exports them and adds the MRR math the Founder Hub needs,
// because the local subscriptions mirror stores plan interval but no
// amounts.
import { PRO_MONTHLY_USD, PRO_ANNUAL_USD } from "../../src/lib/pricing.ts";

export { PRO_MONTHLY_USD, PRO_ANNUAL_USD };

/** Monthly-recurring-revenue contribution of one subscription. */
export function mrrContributionUsd(status: string | null, billingInterval: string | null): number {
  // Trialing counts $0 (no money has moved); past_due counts in full (the
  // relationship is still paying, inside its grace period) and is broken
  // out separately wherever "at risk" matters.
  if (status !== "active" && status !== "past_due") return 0;
  return billingInterval === "year" ? PRO_ANNUAL_USD / 12 : PRO_MONTHLY_USD;
}
