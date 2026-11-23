// Trial intent: remembering that a brand-new account signed up for the Pro
// trial, across the email-confirmation round trip.
//
// The Pro offer on tasketra.com links to /login?plan=pro, and registration
// there continues straight to Billing -- in the tab that registered. But the
// account starts unverified, so that tab waits behind the verify-email gate
// at the Billing URL, while the tab the person actually confirms in (the
// emailed link) lands on /verify-email, whose only way forward is the app
// home. Nothing carried the trial intent across, so a plan=pro signup who
// clicked the emailed link never reached Billing and the trial never
// started.
//
// The intent is stored in this browser at registration (the confirmation
// almost always happens in the same browser) and consumed exactly once, the
// first time a verified user is seen: App's Protected branch asks for it and
// sends a verified free account to Billing. Consumption is deliberately
// one-shot and guarded -- the stored email must match the signed-in account,
// and any account already on a plan (founding, trialing, active, past_due)
// is never routed; its stale intent is simply cleared.

import type { User } from "./api";

const KEY = "tasketra.trialIntent";

/** Called when a plan=pro registration succeeds in this browser. */
export function rememberTrialIntent(email: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ email }));
  } catch {
    // Storage unavailable: the original tab still continues to Billing;
    // only the confirmation-tab handoff is lost.
  }
}

/**
 * Ask whether this verified user should be sent to Billing to start the
 * trial they signed up for. The stored intent is always cleared the first
 * time a verified user is seen, whatever the answer, so it can never fire
 * late or twice. An unverified user neither routes nor consumes: their
 * confirmation is still outstanding.
 */
export function takeTrialIntent(user: User): boolean {
  if (!user || user.emailVerified === false) return false;
  let stored: { email?: unknown } | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    stored = raw ? (JSON.parse(raw) as { email?: unknown }) : null;
  } catch {
    return false;
  }
  if (!stored || typeof stored.email !== "string") return false;
  if (stored.email.toLowerCase() !== user.email.toLowerCase()) return false;
  // Only a free account still has a trial to start. Founding members never
  // see Billing, and trialing/active/past_due accounts are already on one.
  return (user.plan ?? "free") === "free";
}
