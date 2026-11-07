import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, ApiError } from "../lib/api";
import { loadStripeJs, type EmbeddedCheckoutHandle } from "../lib/stripeJs";
import { useDocumentTitle } from "../lib/documentTitle";
import { proPriceLabel } from "../lib/pricing";
import { PageHeader, SoftCard } from "../components/ui";

// Going Pro without leaving Tasketra: the server creates an embedded
// Stripe Checkout session and Stripe's form mounts here. The trial terms
// ride on the form itself (the server's submit message states them), so
// this page's copy sticks to price and renewal facts. If anything about
// the embedded path fails, the hosted Stripe page is one click away.
export default function Checkout() {
  useDocumentTitle("Checkout");
  const [params] = useSearchParams();
  const interval: "month" | "year" = params.get("interval") === "year" ? "year" : "month";
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let embedded: EmbeddedCheckoutHandle | null = null;

    async function openPortal() {
      // A subscription already exists (for example one with a failed
      // payment): the portal is where it gets fixed, not a second
      // checkout. Same handling the Billing page used to do inline.
      try {
        const { url } = await api.createPortalSession();
        window.location.href = url;
      } catch {
        if (!cancelled) setError("You already have a subscription. Open Billing and choose Manage billing to change it or update your card.");
      }
    }

    (async () => {
      try {
        const { clientSecret, publishableKey } = await api.createCheckoutSessionEmbedded(interval);
        if (cancelled) return;
        const stripeFactory = await loadStripeJs();
        if (cancelled) return;
        if (!stripeFactory) {
          setError("The secure payment form couldn't load. You can use the standard checkout instead.");
          return;
        }
        const handle = await stripeFactory(publishableKey).initEmbeddedCheckout({ clientSecret });
        if (cancelled) { handle.destroy(); return; }
        embedded = handle;
        if (frameRef.current) {
          handle.mount(frameRef.current);
          setReady(true);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 409) { await openPortal(); return; }
        setError(err?.message || "Couldn't start checkout.");
      }
    })();

    return () => {
      cancelled = true;
      embedded?.destroy();
    };
  }, [interval]);

  async function useStandardCheckout() {
    setError("");
    setFallbackBusy(true);
    try {
      const { url } = await api.createCheckoutSession(interval);
      window.location.href = url;
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const { url } = await api.createPortalSession();
          window.location.href = url;
          return;
        } catch { /* fall through to the plain error below */ }
      }
      setError(err?.message || "Couldn't start checkout.");
      setFallbackBusy(false);
    }
  }

  const price = proPriceLabel(interval);

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader title="Checkout" subtitle="Tasketra Pro" />

        <SoftCard className="ui-narrow checkout-card">
          <p className="muted" style={{ marginBottom: 4 }}>Plan</p>
          <h2 className="billing-plan-name">Tasketra Pro</h2>
          <p>
            <strong>{price}</strong>. Renews automatically until you cancel. Cancel any time from Billing.
          </p>

          {!error && !ready && (
            <p className="muted" role="status">Loading the secure payment form...</p>
          )}

          {/* Stripe mounts its form into this container. */}
          <div ref={frameRef} className="checkout-frame" />
          {ready && (
            <p className="muted checkout-note">
              Payments are processed securely by Stripe. Your card details never touch Tasketra's servers.
            </p>
          )}

          {error && (
            <>
              <p className="form-error" role="alert">{error}</p>
              <div className="inline-form" style={{ marginBottom: 0 }}>
                <button className="btn btn-primary" type="button" disabled={fallbackBusy} onClick={useStandardCheckout}>
                  {fallbackBusy ? "Opening..." : "Use standard checkout instead"}
                </button>
                <Link className="btn btn-ghost" to="/app/billing">Back to Billing</Link>
              </div>
            </>
          )}
        </SoftCard>
      </main>
    </div>
  );
}
