// @vitest-environment jsdom
//
// The Billing page: payment-problem banner, trial and renewal dates, and the
// 409 "you already subscribed" redirect to the portal.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

let plan = "past_due";
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "me@example.com", plan, emailVerified: true }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("../components/AppSidebar", () => ({ AppSidebar: () => null }));

const calls = { status: vi.fn(), checkout: vi.fn(), portal: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, billingStatus: () => calls.status(), createCheckoutSession: (i: string) => calls.checkout(i), createPortalSession: () => calls.portal() } };
});

import Billing from "../pages/Billing";
import { ApiError } from "../lib/api";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { Object.values(calls).forEach((c) => c.mockReset()); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async (url = "/app/billing") => { await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><Billing /></MemoryRouter>); }); await flush(); };
const button = (t: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe("Billing page", () => {
  it("explains a failed payment and offers the card update", async () => {
    plan = "past_due";
    calls.status.mockResolvedValue({ plan: "past_due", graceEndsAt: "2026-11-01T00:00:00Z", canStartTrial: false, hasBillingAccount: true, cancelAtPeriodEnd: false });
    await render();
    expect(container.textContent).toContain("didn't go through");
    expect(button("Update payment method")).toBeTruthy();
  });

  it("shows when the trial ends and what happens next", async () => {
    plan = "trialing";
    calls.status.mockResolvedValue({ plan: "trialing", trialEnd: "2026-10-30T12:00:00Z", interval: "month", cancelAtPeriodEnd: false, canStartTrial: false, hasBillingAccount: true });
    await render();
    expect(container.textContent).toContain("free trial ends");
    expect(container.textContent).toContain("$29 per month");
  });

  it("says Pro stays on until the end date after cancelling", async () => {
    plan = "active";
    calls.status.mockResolvedValue({ plan: "active", currentPeriodEnd: "2026-11-15T12:00:00Z", interval: "year", cancelAtPeriodEnd: true, canStartTrial: false, hasBillingAccount: true });
    await render();
    expect(container.textContent).toContain("Canceled. Pro stays on until");
  });

  it("only promises a free trial to someone who hasn't had one", async () => {
    plan = "free";
    calls.status.mockResolvedValue({ plan: "free", canStartTrial: false, hasBillingAccount: true, cancelAtPeriodEnd: false });
    await render();
    expect(container.textContent).not.toContain("14 days free");
  });

  it("opens the portal when checkout says a subscription already exists", async () => {
    plan = "free";
    calls.status.mockResolvedValue({ plan: "free", canStartTrial: true, hasBillingAccount: false, cancelAtPeriodEnd: false });
    calls.checkout.mockRejectedValue(new ApiError("You already have a subscription.", 409));
    calls.portal.mockRejectedValue(new Error("portal stub"));
    await render();
    await act(async () => { button("Upgrade -- $29/month").click(); });
    await flush();
    expect(calls.portal).toHaveBeenCalled();
  });
});
