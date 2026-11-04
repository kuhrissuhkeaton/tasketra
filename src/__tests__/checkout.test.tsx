// @vitest-environment jsdom
//
// The embedded Checkout page (v148): mounts Stripe's form from the
// embedded session, shows the plan facts, and falls back to the hosted
// page (or the portal, on a 409) when the embedded path can't start.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@x.co", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("../components/AppSidebar", () => ({ AppSidebar: () => null }));

const m = vi.hoisted(() => ({
  embedded: vi.fn(), hosted: vi.fn(), portal: vi.fn(),
  loadStripeJs: vi.fn(), factory: vi.fn(), init: vi.fn(), mount: vi.fn(), destroy: vi.fn(),
}));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      createCheckoutSessionEmbedded: (i: string) => m.embedded(i),
      createCheckoutSession: (i: string) => m.hosted(i),
      createPortalSession: () => m.portal(),
    },
  };
});
vi.mock("../lib/stripeJs", () => ({ loadStripeJs: () => m.loadStripeJs() }));

import Checkout from "../pages/Checkout";
import { ApiError } from "../lib/api";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.embedded.mockResolvedValue({ clientSecret: "cs_test_1", publishableKey: "pk_test_1" });
  m.init.mockResolvedValue({ mount: m.mount, destroy: m.destroy });
  m.factory.mockReturnValue({ initEmbeddedCheckout: m.init });
  m.loadStripeJs.mockResolvedValue(m.factory);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function renderPage(url = "/app/billing/checkout") {
  await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><Checkout /></MemoryRouter>); });
  await flush(); await flush();
}
const button = (t: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

describe("Checkout page", () => {
  it("mounts the embedded form with the session's client secret and shows the monthly plan facts", async () => {
    await renderPage();
    expect(m.embedded).toHaveBeenCalledWith("month");
    expect(m.factory).toHaveBeenCalledWith("pk_test_1");
    expect(m.init).toHaveBeenCalledWith({ clientSecret: "cs_test_1" });
    expect(m.mount).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Tasketra Pro");
    expect(container.textContent).toContain("$29 per month");
    expect(container.textContent).toContain("Renews automatically until you cancel. Cancel any time from Billing.");
    expect(container.textContent).toContain("Payments are processed securely by Stripe. Your card details never touch Tasketra's servers.");
    expect(container.textContent).not.toContain("14-day free trial");
  });

  it("shows the yearly price and asks for a yearly session when ?interval=year", async () => {
    await renderPage("/app/billing/checkout?interval=year");
    expect(m.embedded).toHaveBeenCalledWith("year");
    expect(container.textContent).toContain("$290 per year");
    expect(container.textContent).not.toContain("$29 per month");
  });

  it("shows the server's error plainly and the fallback button starts the hosted checkout", async () => {
    m.embedded.mockRejectedValue(new Error("Billing isn't configured yet."));
    m.hosted.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    await renderPage();
    expect(container.textContent).toContain("Billing isn't configured yet.");
    const fallback = button("Use standard checkout instead");
    expect(fallback).toBeTruthy();
    await act(async () => { fallback!.click(); });
    await flush();
    expect(m.hosted).toHaveBeenCalledWith("month");
  });

  it("sends an already-subscribed user to the portal, like Billing used to", async () => {
    m.embedded.mockRejectedValue(new ApiError("You already have a subscription. Use Manage billing to change it or update your card.", 409));
    m.portal.mockResolvedValue({ url: "https://billing.stripe.test/p" });
    await renderPage();
    await flush();
    expect(m.portal).toHaveBeenCalledTimes(1);
  });

  it("offers the hosted fallback when Stripe.js itself can't load", async () => {
    m.loadStripeJs.mockResolvedValue(null);
    await renderPage();
    expect(m.mount).not.toHaveBeenCalled();
    expect(container.textContent).toContain("couldn't load");
    expect(button("Use standard checkout instead")).toBeTruthy();
  });
});
