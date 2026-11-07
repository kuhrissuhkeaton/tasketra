// @vitest-environment jsdom
//
// The admin Founder Hub page (v152): renders all five panels from a fixture
// response — milestone ladder, revenue, users & activation, feature usage,
// friction — including the honesty notes (churn not measurable, verified
// backfill, check-in ownership attribution, unlogged sections).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u-admin", email: "admin@example.com", isAdmin: true, tour_completed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = { hub: vi.fn() };

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, adminGetFounderHub: () => calls.hub() },
  };
});

import AdminFounderHub from "../pages/AdminFounderHub";

const FIXTURE = {
  milestones: {
    rungs: [
      { id: "first-ga-paying", label: "First GA paying customer", state: "pending", current: 0, target: 1 },
      { id: "first-annual-payer", label: "First annual-plan payer", state: "pending", current: 0, target: 1 },
      { id: "ten-ga-payers", label: "10 GA payers", state: "pending", current: 0, target: 10 },
      { id: "mrr-1k", label: "$1K MRR", state: "pending", current: 0, target: 1000 },
      { id: "fifty-ga-payers", label: "50 GA payers", state: "pending", current: 0, target: 50 },
      { id: "mrr-5k", label: "$5K MRR", state: "pending", current: 0, target: 5000 },
      { id: "churn-under-5", label: "Monthly churn under 5%", state: "not_measurable", current: null, target: 5 },
    ],
    nextMilestone: { id: "first-ga-paying", label: "First GA paying customer", current: 0, target: 1 },
  },
  revenue: {
    gaMrr: 0, gaPayers: 0, gaPayersActive: 0, gaPayersTrialing: 0,
    payersByPlan: { payingMonthly: 0, payingYearly: 0, trialingMonthly: 0, trialingYearly: 0 },
    trials: { count: 0, trialEnds: [] },
    pastDue: { count: 0, mrrAtRisk: 0 },
    foundingSubscribers: { active: 0, trialing: 0, pastDue: 0, mrr: 0 },
  },
  users: {
    total: 103,
    cohorts: { freeForever: 100, inTrial: 0, payingMonthly: 0, payingYearly: 0, freeRegular: 3 },
    gaPayers: 0,
    signupsPerWeek: [{ week: "2026-11-02", count: 2 }],
    funnel: [
      { key: "signed_up", label: "Signed up", count: 3, pctFromPrevious: null },
      { key: "verified", label: "Verified email", count: 3, pctFromPrevious: 100 },
      { key: "created_project", label: "Created a project", count: 1, pctFromPrevious: 33.3 },
      { key: "added_task", label: "Added a task", count: 1, pctFromPrevious: 100 },
      { key: "posted_checkin", label: "Posted a check-in", count: 0, pctFromPrevious: 0 },
      { key: "created_decision", label: "Created a decision request", count: 0, pctFromPrevious: null },
    ],
  },
  usage: {
    sections: [
      { section: "Tasks", entityTypes: ["task"], actions30d: 12, actionsAllTime: 40, distinctProjects: 4, distinctUsers: 3 },
      { section: "Issues", entityTypes: ["issue"], actions30d: 0, actionsAllTime: 0, distinctProjects: 0, distinctUsers: 0 },
    ],
    rarelyUsed: ["Issues", "Budget*", "Charter*"],
    unloggedSections: ["Budget", "Charter"],
    depth: { medianActionsPerProject: 5, medianSectionsPerProject: 2, activeProjects30d: 4 },
  },
  friction: {
    feedback: { byStatus: { new: 2, planned: 1, shipped: 5, dismissed: 0 }, newLast7d: 1, newLast30d: 2, oldestNewAt: "2026-10-20T00:00:00.000Z", oldestNewAgeDays: 18 },
    pulseSent30d: 100,
    cancellations30d: 1,
  },
};

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(async () => {
  calls.hub.mockReset().mockResolvedValue(FIXTURE);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter><AdminFounderHub /></MemoryRouter>);
  });
  await act(async () => {});
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

describe("Founder Hub admin page", () => {
  it("renders all five panels", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("Milestones");
    expect(text).toContain("Revenue");
    expect(text).toContain("Users and activation");
    expect(text).toContain("Feature usage (last 30 days)");
    expect(text).toContain("Friction");
    expect(calls.hub).toHaveBeenCalledTimes(1);
  });

  it("shows the next milestone and the ladder states, with churn honestly unmeasurable", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("Next milestone:");
    expect(text).toContain("First GA paying customer — 0 of 1");
    expect(text).toContain("Monthly churn under 5%");
    expect(text).toContain("Not measurable yet");
    expect(text).toContain("Monthly churn is not measurable yet");
    // No measured churn value is ever presented: cancellations are
    // explicitly described as a count, not a rate.
    expect(text).toContain("Cancellations are a count, not a churn rate");
  });

  it("shows an achieved rung distinctly when one is achieved", async () => {
    const achieved = {
      ...FIXTURE,
      milestones: {
        ...FIXTURE.milestones,
        rungs: FIXTURE.milestones.rungs.map((r) => (r.id === "first-ga-paying" ? { ...r, state: "achieved" as const, current: 1 } : r)),
        nextMilestone: { id: "first-annual-payer", label: "First annual-plan payer", current: 0, target: 1 },
      },
    };
    calls.hub.mockResolvedValue(achieved);
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await act(async () => {
      root.render(<MemoryRouter><AdminFounderHub /></MemoryRouter>);
    });
    await act(async () => {});
    expect(host.textContent).toContain("Achieved");
    expect(host.textContent).toContain("Next milestone:");
    expect(host.textContent).toContain("First annual-plan payer — 0 of 1");
  });

  it("shows the cohort breakdown with the groups Kk named", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("Total users");
    expect(text).toContain("Free forever (beta/founding)");
    expect(text).toContain("In trial");
    expect(text).toContain("Paying monthly");
    expect(text).toContain("Paying yearly");
    expect(text).toContain("100"); // free forever count
    expect(text).toContain("MRR (from plan mix)");
  });

  it("shows the rarely-used line and both attribution footnotes", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("No activity in 30 days: Issues, Budget*, Charter*");
    expect(text).toContain("every existing account was marked verified"); // verified-backfill footnote
    expect(text).toContain("counted through the projects a person owns"); // check-in ownership footnote
    expect(text).toContain("never write an activity record"); // unlogged-sections footnote
  });

  it("shows friction counts, the feedback link, and the Sentry/Plausible link-outs", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("Cancellations (30 days)");
    expect(text).toContain("Pulse emails sent (30 days)");
    expect(text).toContain("replies go to your inbox and aren't tracked here");
    expect(host.querySelector('a[href="/admin/feedback"]')).not.toBeNull();
    const hrefs = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://sentry.io");
    expect(hrefs).toContain("https://plausible.io");
    expect(hrefs).toContain("https://dashboard.stripe.com");
  });

  it("shows the server error when the hub fails to load", async () => {
    calls.hub.mockRejectedValue(new Error("Not authorized"));
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await act(async () => {
      root.render(<MemoryRouter><AdminFounderHub /></MemoryRouter>);
    });
    await act(async () => {});
    expect(host.textContent).toContain("Not authorized");
  });
});
