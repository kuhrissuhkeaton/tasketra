// @vitest-environment jsdom
//
// v163 (Phase 6, Delight pack): the state-based eggs on the project page
// and the Delight toggle that suppresses them. Mounts the real
// ProjectHome the way roleOwners.test.tsx does. Egg 3 (Fully loaded
// register, v158) and Egg 11 (All quiet on the risk front) share the
// Risks register summary; Egg 7 (answered within the hour) sits on the
// decision card. With the toggle off (localStorage "off" for the mocked
// user), every one of them is gone and the plain surfaces remain.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import ProjectHome from "../pages/ProjectHome";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { clearApiCache } from "../lib/api";

const PROJECT = {
  id: "p1", name: "Delight Project", description: "A project", is_owner: true,
  size: "full", approach: "hybrid", show_all_tabs: true, stage: "plan",
  created_at: "2026-09-01T00:00:00Z",
};

const risk = (over: Record<string, unknown> = {}) => ({
  id: "r1", title: "Vendor slips", description: null, probability: "medium", impact: "high",
  probability_score: 3, impact_score: 4, mitigation: null, owner_name: "Maya",
  status: "resolved", created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-20T09:00:00Z",
  resolved_at: "2026-10-20T09:00:00Z", ...over,
});

const FAST_DECISION = {
  id: "d1", title: "Pick a vendor", context: null, options: ["Approve", "Reject"],
  deadline: null, public_token: "tok", status: "resolved",
  created_at: "2026-11-10T10:00:00Z",
  chosen_option: "Approve", responder_name: "Maya", responded_at: "2026-11-10T10:43:00Z",
  outcome_confirmed_at: "2026-11-10T10:50:00Z",
  records: [{ id: "rec1", chosen_option: "Approve", responder_name: "Maya", responded_at: "2026-11-10T10:43:00Z", confirmed_at: "2026-11-10T10:50:00Z" }],
  recipients: [{ id: "s1", name: "Maya" }],
  owner_stakeholder_id: null, owner: null,
};

let host: HTMLDivElement;
let root: Root;
let errors: string[];

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = (() => {}) as any;
});

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" "));
  });
  window.localStorage.clear();
  clearApiCache();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host.remove();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function mount(tab: string, handler: (url: string) => unknown, project: Record<string, unknown> = PROJECT) {
  vi.stubGlobal("fetch", vi.fn((input: unknown) => {
    const url = String(input);
    if (/\/api\/project\?id=/.test(url)) return jsonResponse({ project });
    const out = handler(url) as any;
    if (out !== undefined) return jsonResponse(out.body ?? out, out.status ?? 200);
    return new Promise(() => {}); // everything else stays loading
  }));
  root = createRoot(host, {
    onUncaughtError: (e) => { errors.push(`uncaught: ${e instanceof Error ? e.message + "\n" + e.stack : String(e)}`); },
    onCaughtError: (e) => { errors.push(`caught: ${e instanceof Error ? e.message : String(e)}`); },
  });
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/app/projects/p1?tab=${tab}`]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/app/projects/:id" element={<ProjectHome />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    );
  });
  await settle(() => (host.textContent || "").length > 0);
}

async function settle(predicate: () => boolean, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

function risksHandler(risks: unknown[]) {
  return (url: string) => {
    if (/\/api\/risks\?/.test(url)) return { risks };
    if (/\/api\/tasks\?/.test(url)) return { tasks: [] };
    if (/\/api\/raid-task-links\?/.test(url)) return { riskLinks: [], issueLinks: [] };
    return undefined;
  };
}

describe("Risks register eggs (3 and 11)", () => {
  it("all risks resolved: Egg 11 shows, and vanishes the moment one opens", async () => {
    await mount("risks", risksHandler([risk({})]));
    await settle(() => (host.textContent || "").includes("All quiet on the risk front."));
    expect(host.textContent).toContain("All quiet on the risk front.");
    expect(host.textContent).not.toContain("Fully loaded register");
    expect(errors).toEqual([]);
  });

  it("an open, scored, owned risk: Egg 3 shows instead", async () => {
    await mount("risks", risksHandler([risk({ status: "open", resolved_at: null })]));
    await settle(() => (host.textContent || "").includes("Fully loaded register"));
    expect(host.textContent).toContain("Fully loaded register");
    expect(host.textContent).not.toContain("All quiet on the risk front.");
  });

  it("Delight off: neither egg shows, the register still renders", async () => {
    window.localStorage.setItem("tasketra:delight:u1", "off");
    await mount("risks", risksHandler([risk({})]));
    await settle(() => (host.textContent || "").includes("Vendor slips"));
    expect(host.textContent).not.toContain("All quiet on the risk front.");
    expect(host.textContent).not.toContain("Fully loaded register");
  });
});

describe("Decision card Egg 7", () => {
  const decisionsHandler = (url: string) => {
    if (/\/api\/decisions\?/.test(url)) return { decisions: [FAST_DECISION] };
    if (/\/api\/stakeholders\?/.test(url)) return { stakeholders: [] };
    return undefined;
  };

  it("an answer inside the hour earns the line, with the real minutes", async () => {
    await mount("decisions", decisionsHandler);
    // v172: decided cards live in the collapsed Decided group; open it first.
    await settle(() => !!host.querySelector("button.layer-group-btn"));
    const toggle = host.querySelector<HTMLButtonElement>("button.layer-group-btn")!;
    await act(async () => { toggle.click(); });
    await settle(() => (host.textContent || "").includes("A record worth framing."));
    expect(host.textContent).toContain("Answered in 43 minutes. A record worth framing.");
    expect(errors).toEqual([]);
  });

  it("Delight off: the line is gone, the card is intact", async () => {
    window.localStorage.setItem("tasketra:delight:u1", "off");
    await mount("decisions", decisionsHandler);
    await settle(() => !!host.querySelector("button.layer-group-btn"));
    const toggle = host.querySelector<HTMLButtonElement>("button.layer-group-btn")!;
    await act(async () => { toggle.click(); });
    await settle(() => (host.textContent || "").includes("Pick a vendor"));
    expect(host.textContent).not.toContain("A record worth framing.");
  });
});

describe("Closure Egg 9 (Closed properly)", () => {
  const FULL_CHECKLIST = {
    finalLessons: true, openItemsResolved: true, budgetReconciled: true,
    stakeholderSignoff: true, documentsArchived: true,
  };
  const closedProject = (checklist: Record<string, boolean>) => ({
    ...PROJECT, closed_at: "2026-11-01T12:00:00Z", closure_checklist: checklist, closure_notes: null,
  });
  const closureHandler = (url: string) => {
    if (/\/api\/risks\?/.test(url)) return { risks: [] };
    if (/\/api\/issues\?/.test(url)) return { issues: [] };
    if (/\/api\/charter-approval\?/.test(url)) return { approval: null };
    return undefined;
  };

  it("closed with the checklist complete: the line reads on the Closed card", async () => {
    await mount("closure", closureHandler, closedProject(FULL_CHECKLIST));
    await settle(() => (host.textContent || "").includes("Closed properly. Future you says thanks."));
    expect(host.textContent).toContain("Closed properly. Future you says thanks.");
    expect(errors).toEqual([]);
  });

  it("closed with one item unchecked: no line", async () => {
    await mount("closure", closureHandler, closedProject({ ...FULL_CHECKLIST, documentsArchived: false }));
    await settle(() => (host.textContent || "").includes("marked closed on"));
    expect(host.textContent).not.toContain("Closed properly.");
  });

  it("Delight off: no line even on a proper close", async () => {
    window.localStorage.setItem("tasketra:delight:u1", "off");
    await mount("closure", closureHandler, closedProject(FULL_CHECKLIST));
    await settle(() => (host.textContent || "").includes("marked closed on"));
    expect(host.textContent).not.toContain("Closed properly.");
  });
});
