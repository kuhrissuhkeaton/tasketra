// Pro plan prices in USD — the ONE source of truth for the numbers and
// their display strings, shared by the app (Billing page) and the server
// (checkout copy, Founder Hub MRR). The Stripe price IDs themselves live in
// env (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL); if the amounts ever
// change, they change here and in the Stripe dashboard, nowhere else.
export const PRO_MONTHLY_USD = 29;
export const PRO_ANNUAL_USD = 290;

/** "$29 per month" / "$290 per year" — the sentence form used at checkout
 *  and on the Billing page. */
export function proPriceLabel(interval: string | null | undefined): string {
  return interval === "year" ? `$${PRO_ANNUAL_USD} per year` : `$${PRO_MONTHLY_USD} per month`;
}
