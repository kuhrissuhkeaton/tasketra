// Loads Stripe.js (https://js.stripe.com/v3) exactly once and hands back
// the global Stripe factory. Loaded from Stripe's own CDN on purpose: card
// details are entered into Stripe's frame, never ours, and staying on the
// script loader (instead of the npm package) keeps the app bundle free of
// a payment dependency. Resolves to null when the script is blocked or
// fails, so callers can fall back to the hosted checkout page.

export interface EmbeddedCheckoutHandle {
  mount(el: HTMLElement): void;
  destroy(): void;
}

export interface StripeInstance {
  initEmbeddedCheckout(options: { clientSecret: string }): Promise<EmbeddedCheckoutHandle>;
}

export type StripeFactory = (publishableKey: string) => StripeInstance;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

let loadPromise: Promise<StripeFactory | null> | null = null;

export function loadStripeJs(): Promise<StripeFactory | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (!loadPromise) {
    loadPromise = new Promise<StripeFactory | null>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3";
      script.async = true;
      script.onload = () => resolve(window.Stripe ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}
