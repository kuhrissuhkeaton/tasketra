// @vitest-environment jsdom
//
// v175: the public decision page becomes a branded record with one quiet
// footer CTA, the responder copy tells the truth about who will see a
// name and choice (Marshall's condition 2), and the Decisions tab gains
// the Stop sharing off switch with its one-line exposure notice
// (condition 3). Mounts the real DecisionPublic and the real ProjectHome
// decisions tab with the api answered at the fetch layer.
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

import DecisionPublic from "../pages/DecisionPublic";
import ProjectHome from "../pages/ProjectHome";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { clearApiCache } from "../lib/api";

const OPEN_DECISION = {
  decision: {
    title: "Which date works best?", context: "The sponsor is in town both weeks.",
    options: ["Nov 20", "Nov 27"], deadline: null, status: "open", project_name: "Website Relaunch",
  },
  record: null,
};

const DEADLINE_DECISION = {
  decision: {
    title: "Which date works best?", context: "The sponsor is in town both weeks.",
    options: ["Nov 20", "Nov 27"], deadline: "2026-12-04T00:00:00.000Z", status: "open", project_name: "Website Relaunch",
  },
  record: null,
};

const DECIDED_DECISION = {
  decision: {
    title: "Which date works best?", context: "The sponsor is in town both weeks.",
    options: ["Nov 20", "Nov 27"], deadline: null, status: "resolved", project_name: "Website Relaunch",
  },
  record: { chosen_option: "Nov 27", responder_name: "Sponsor One", responded_at: "2026-11-20T15:04:00Z" },
};

let host: HTMLDivElement;
let root: Root;
let errors: string[];
let plausible: ReturnType<typeof vi.fn>;

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
  plausible = vi.fn();
  (window as any).plausible = plausible;
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host.remove();
  delete (window as any).plausible;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function settle(predicate: () => boolean, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mountDecisionPage(handler: (url: string, method: string, body: any) => unknown) {
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const method = init?.method || "GET";
    let body: any = undefined;
    try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { /* not JSON */ }
    const out = handler(url, method, body) as any;
    if (out !== undefined) return jsonResponse(out.body ?? out, out.status ?? 200);
    return new Promise(() => {});
  }));
  root = createRoot(host, {
    onUncaughtError: (e) => { errors.push(`uncaught: ${e instanceof Error ? e.message + "\n" + e.stack : String(e)}`); },
    onCaughtError: (e) => { errors.push(`caught: ${e instanceof Error ? e.message : String(e)}`); },
  });
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/d/tok1"]}>
        <Routes>
          <Route path="/d/:token" element={<DecisionPublic />} />
        </Routes>
      </MemoryRouter>
    );
  });
}

describe("the public decision page (v175)", () => {
  it("open: branded record, truthful responder copy, the one footer CTA, neutral tab title", async () => {
    await mountDecisionPage((url) => {
      if (/\/api\/decision-public/.test(url)) return OPEN_DECISION;
      return undefined;
    });
    await settle(() => (host.textContent || "").includes("Which date works best?"));

    const text = host.textContent || "";
    expect(text).toContain("A decision on the record");
    expect(text).toContain("Regarding project: Website Relaunch");
    // Condition 2: the form says who will see the responder's name and choice.
    expect(text).toContain("your name and choice will be visible to anyone with this link once the owner confirms the decision");
    expect(text).not.toContain("Your response is recorded for the project team. The owner confirms the final decision.");
    // The single CTA, free-tier only, carrying the source marker.
    expect(text).toContain("Decisions like this one are kept on record with Tasketra.");
    expect(text).toContain("Free for up to 3 projects. No card to start.");
    const cta = [...host.querySelectorAll("a")].find((a) => a.textContent === "Start free");
    expect(cta).toBeTruthy();
    expect(cta!.getAttribute("href")).toBe("/login?mode=register&src=decision-link");
    // The decision title stays out of the browser tab (useDocumentTitle
    // appends the brand suffix to the neutral title).
    expect(document.title).toBe("Decision request | Tasketra");
    expect(document.title).not.toContain("Which date works best?");
    // Viewed event: state only.
    expect(plausible).toHaveBeenCalledWith("decision_link_viewed", { props: { state: "open" } });
    expect(errors).toEqual([]);
  });

  it("needed-by date: renders formatted (Dec 4, 2026), never the raw ISO timestamp (v175.1)", async () => {
    await mountDecisionPage((url) => {
      if (/\/api\/decision-public/.test(url)) return DEADLINE_DECISION;
      return undefined;
    });
    await settle(() => (host.textContent || "").includes("Needed by:"));

    const text = host.textContent || "";
    expect(text).toContain("Needed by: Dec 4, 2026");
    expect(text).not.toContain("2026-12-04T00:00:00.000Z");
    expect(errors).toEqual([]);
  });

  it("decided: the record card wears the Decided marker and the CTA still stands", async () => {
    await mountDecisionPage((url) => {
      if (/\/api\/decision-public/.test(url)) return DECIDED_DECISION;
      return undefined;
    });
    await settle(() => (host.textContent || "").includes("Sponsor One"));

    const marker = host.querySelector(".decision-decided-marker");
    expect(marker?.textContent).toBe("Decided");
    const text = host.textContent || "";
    expect(text).toContain("Nov 27");
    expect(text).toContain("This decision has been decided. You can close this page.");
    expect(text).toContain("Decisions like this one are kept on record with Tasketra.");
    expect(plausible).toHaveBeenCalledWith("decision_link_viewed", { props: { state: "decided" } });
    expect(errors).toEqual([]);
  });

  it("invalid link: the error shows and no CTA is offered", async () => {
    await mountDecisionPage((url) => {
      if (/\/api\/decision-public/.test(url)) return { body: { error: "This decision link is not valid." }, status: 404 };
      return undefined;
    });
    await settle(() => (host.textContent || "").includes("not valid"));

    expect(host.textContent).toContain("This decision link is not valid.");
    expect(host.textContent).not.toContain("Start free");
    expect(errors).toEqual([]);
  });

  it("responding records the response and fires the responded event", async () => {
    await mountDecisionPage((url, method, body) => {
      if (/\/api\/decision-public/.test(url) && method === "POST") {
        return { body: { record: { chosen_option: body.chosenOption, responder_name: body.responderName, responded_at: "2026-11-20T16:00:00Z" } }, status: 201 };
      }
      if (/\/api\/decision-public/.test(url)) return OPEN_DECISION;
      return undefined;
    });
    await settle(() => (host.textContent || "").includes("Which date works best?"));

    const radio = host.querySelector('input[type="radio"][value="Nov 20"]') as HTMLInputElement;
    expect(radio).toBeTruthy();
    await act(async () => { radio.click(); });
    const nameInput = host.querySelector("#f-decisionpublic-85") as HTMLInputElement;
    await act(async () => { setInputValue(nameInput, "Sponsor One"); });
    const submit = [...host.querySelectorAll("button")].find((b) => b.textContent === "Submit response")!;
    await act(async () => { submit.click(); });
    await settle(() => (host.textContent || "").includes("Thanks, your response was recorded."));

    expect(plausible).toHaveBeenCalledWith("decision_link_responded", undefined);
    expect(errors).toEqual([]);
  });
});

describe("the Decisions tab off switch (v175)", () => {
  const PROJECT = {
    id: "p1", name: "Share Control Project", description: "A project", is_owner: true,
    size: "full", approach: "hybrid", show_all_tabs: true, stage: "plan",
    created_at: "2026-09-01T00:00:00Z",
  };
  const OPEN = {
    id: "d1", title: "Approve the baseline", context: "", options: ["Approve", "Reject"],
    status: "open", deadline: null, created_at: "2026-11-10T10:00:00Z", public_token: "tok1",
    recipients: [], records: [], owner_stakeholder_id: null, owner: null,
    chosen_option: null, responder_name: null, responded_at: null, outcome_confirmed_at: null,
  };

  it("shows the exposure notice by the share field, and Stop sharing swaps in the new link", async () => {
    const patches: any[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method || "GET";
      let body: any = undefined;
      try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { /* not JSON */ }
      if (/\/api\/project\?id=/.test(url)) return jsonResponse({ project: PROJECT });
      if (/\/api\/decisions\?projectId=/.test(url)) return jsonResponse({ decisions: [OPEN] });
      if (/\/api\/stakeholders\?projectId=/.test(url)) return jsonResponse({ stakeholders: [] });
      if (/\/api\/decisions$/.test(url) && method === "PATCH") {
        patches.push(body);
        return jsonResponse({ ok: true, public_token: "tok2", shareUrl: "/d/tok2" });
      }
      return new Promise(() => {});
    }));
    root = createRoot(host, {
      onUncaughtError: (e) => { errors.push(`uncaught: ${e instanceof Error ? e.message + "\n" + e.stack : String(e)}`); },
      onCaughtError: (e) => { errors.push(`caught: ${e instanceof Error ? e.message : String(e)}`); },
    });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/app/projects/p1?tab=decisions"]}>
          <ConfirmProvider>
            <Routes>
              <Route path="/app/projects/:id" element={<ProjectHome />} />
            </Routes>
          </ConfirmProvider>
        </MemoryRouter>
      );
    });
    await settle(() => !!host.querySelector(".decision-card"));

    const card = host.querySelector(".decision-card")!;
    expect(card.textContent).toContain("Anyone with this link can see the decision's title, context, and options, and the decider's name once it's decided.");
    const shareInput = card.querySelector('input[aria-label="Decision share link"]') as HTMLInputElement;
    expect(shareInput.value).toContain("/d/tok1");

    const stopBtn = [...card.querySelectorAll("button")].find((b) => b.textContent === "Stop sharing")!;
    expect(stopBtn).toBeTruthy();
    await act(async () => { stopBtn.click(); });
    await settle(() => !!document.querySelector('[role="alertdialog"]'));
    const confirmBtn = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "Stop sharing")!;
    await act(async () => { confirmBtn.click(); });
    await settle(() => shareInput.value.includes("/d/tok2"));

    expect(patches).toEqual([{ id: "d1", action: "rotate-share" }]);
    expect(shareInput.value).toContain("/d/tok2");
    expect(errors).toEqual([]);
  });
});
