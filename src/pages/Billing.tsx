import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../lib/auth-context";
import { api, ApiError, type BillingStatus } from "../lib/api";
import { fmtDate } from "../lib/format";

const PLAN_LABEL: Record<string, string> = {
  founding: "Founding member",
  trialing: "Pro (trial)",
  active: "Pro",
  past_due: "Pro (payment problem)",
  free: "Free",
};

export default function Billing() {
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const [loadingInterval, setLoadingInterval] = useState<"month" | "year" | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<BillingStatus | null>(null);
  const [waiting, setWaiting] = useState(false);

  const plan = user?.plan || "free";
  const billingResult = params.get("billing");

  // Coming back from Stripe, our copy of the subscription is updated by a
  // webhook that can lag a few seconds. Check again for a short while rather
  // than showing "Free" right after someone paid.
  useEffect(() => {
    if (billingResult !== "success" || plan !== "free") { setWaiting(false); return; }
    setWaiting(true);
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      refresh();
      if (tries >= 10) { clearInterval(timer); setWaiting(false); }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingResult, plan]);

  useEffect(() => {
    let cancelled = false;
    api.billingStatus().then((d) => { if (!cancelled) setDetails(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [plan]);

  async function manageBilling() {
    setError("");
    setLoadingPortal(true);
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || "Couldn't open the billing portal.");
      setLoadingPortal(false);
    }
  }

  async function upgrade(interval: "month" | "year") {
    setError("");
    setLoadingInterval(interval);
    try {
      const { url } = await api.createCheckoutSession(interval);
      window.location.href = url;
    } catch (err: any) {
      // They already have a subscription (for example one with a failed
      // payment): the portal is where it gets fixed, not a second checkout.
      if (err instanceof ApiError && err.status === 409) {
        setLoadingInterval(null);
        await manageBilling();
        return;
      }
      setError(err.message || "Couldn't start checkout.");
      setLoadingInterval(null);
    }
  }

  const trialOffer = details ? details.canStartTrial : true;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>Billing</h1>
        </div>

        {billingResult === "success" && plan !== "free" && (
          <p className="form-success" style={{ marginBottom: 20 }}>
            You're all set. Thanks for subscribing to Tasketra Pro.
          </p>
        )}
        {billingResult === "success" && plan === "free" && waiting && (
          <p className="muted" role="status" style={{ marginBottom: 20 }}>
            Finishing up. Your plan will update in a few seconds...
          </p>
        )}
        {billingResult === "success" && plan === "free" && !waiting && (
          <p className="muted" role="status" style={{ marginBottom: 20 }}>
            Your payment went through but your plan hasn't updated yet. Refresh in a minute; if it still says Free, reply to any of our emails and we'll sort it out.
          </p>
        )}
        {billingResult === "canceled" && (
          <p className="muted" style={{ marginBottom: 20 }}>
            Checkout was canceled. No changes were made.
          </p>
        )}

        <div className="billing-card" style={{ maxWidth: 640, marginBottom: 24 }}>
          <p className="muted" style={{ marginBottom: 4 }}>Current plan</p>
          <h2 style={{ marginTop: 0 }}>{PLAN_LABEL[plan]}</h2>

          {plan === "founding" && (
            <p className="muted">
              You're one of our first 100 users -- Pro features are free for you, forever, as a
              thank-you for helping build Tasketra. No card, no trial, no catch.
            </p>
          )}

          {plan === "past_due" && (
            <div className="form-error" role="alert" style={{ marginBottom: 12 }}>
              Your last payment didn't go through. You still have Pro while we retry
              {details?.graceEndsAt ? `, until about ${fmtDate(details.graceEndsAt)}` : ""}. Update your card to keep it.
              Your projects are safe either way.
            </div>
          )}

          {(plan === "trialing" || plan === "active" || plan === "past_due") && (
            <>
              {plan === "trialing" && details?.trialEnd && (
                <p>
                  Your free trial ends on <strong>{fmtDate(details.trialEnd)}</strong>.
                  {details.cancelAtPeriodEnd
                    ? " You've canceled, so you won't be charged."
                    : ` After that your card is charged ${details.interval === "year" ? "$290 per year" : "$29 per month"} until you cancel.`}
                </p>
              )}
              {plan === "active" && details?.currentPeriodEnd && (
                <p>
                  {details.cancelAtPeriodEnd
                    ? <>Canceled. Pro stays on until <strong>{fmtDate(details.currentPeriodEnd)}</strong>, then you move to Free and keep all your projects.</>
                    : <>Renews on <strong>{fmtDate(details.currentPeriodEnd)}</strong> ({details.interval === "year" ? "$290 per year" : "$29 per month"}).</>}
                </p>
              )}
              <p className="muted">
                Unlimited projects, up to 25 team members per project, and 25GB of document storage.
                Update your card, view invoices, switch billing interval, or cancel any time -- no need to contact us.
              </p>
              <button className="btn btn-primary" type="button" disabled={loadingPortal} onClick={manageBilling}>
                {loadingPortal ? "Opening..." : plan === "past_due" ? "Update payment method" : "Manage billing"}
              </button>
            </>
          )}

          {plan === "free" && (
            <>
              <p className="muted">
                Up to 3 active projects (finished projects don't count), up to 25 team members per project, and 2GB of document storage.
                {trialOffer
                  ? " Upgrade to Pro for unlimited projects and 25GB of storage -- 14 days free, cancel any time from this page."
                  : " Upgrade to Pro for unlimited projects and 25GB of storage. Cancel any time from this page."}
              </p>
              {details?.hasBillingAccount && (
                <p className="muted">
                  Your earlier subscription has ended. Everything you built is still here.
                </p>
              )}
              <div className="inline-form">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={loadingInterval !== null}
                  onClick={() => upgrade("month")}
                >
                  {loadingInterval === "month" ? "Redirecting..." : "Upgrade -- $29/month"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={loadingInterval !== null}
                  onClick={() => upgrade("year")}
                >
                  {loadingInterval === "year" ? "Redirecting..." : "Upgrade -- $290/year (2 months free)"}
                </button>
              </div>
            </>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>
      </main>
    </div>
  );
}
