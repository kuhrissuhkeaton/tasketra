import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const PLAN_LABEL: Record<string, string> = {
  founding: "Founding member",
  trialing: "Pro (trial)",
  active: "Pro",
  free: "Free",
};

export default function Billing() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [loadingInterval, setLoadingInterval] = useState<"month" | "year" | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  const plan = user?.plan || "free";
  const billingResult = params.get("billing");

  async function upgrade(interval: "month" | "year") {
    setError("");
    setLoadingInterval(interval);
    try {
      const { url } = await api.createCheckoutSession(interval);
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || "Couldn't start checkout.");
      setLoadingInterval(null);
    }
  }

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

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>Billing</h1>
        </div>

        {billingResult === "success" && (
          <p className="form-success" style={{ marginBottom: 20 }}>
            You're all set -- your Pro trial has started.
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

          {(plan === "trialing" || plan === "active") && (
            <>
              <p className="muted">
                Unlimited projects, up to 25 team members per project. Manage your payment method,
                view invoices, switch billing interval, or cancel any time -- no need to contact us.
              </p>
              <button className="btn btn-primary" type="button" disabled={loadingPortal} onClick={manageBilling}>
                {loadingPortal ? "Opening..." : "Manage billing"}
              </button>
            </>
          )}

          {plan === "free" && (
            <>
              <p className="muted">
                Up to 3 active projects, and up to 25 team members per project. Upgrade to Pro for
                unlimited projects -- 14 days free, cancel any time from this page.
              </p>
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
