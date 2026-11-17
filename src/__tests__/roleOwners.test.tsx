// @vitest-environment jsdom
//
// v162 (F-11): role ownership in the project page UI. Mounts the real
// ProjectHome the way projectPage.smoke.test.tsx does, with the tab's own
// endpoints answered, and checks the three things the phase adds: a task
// assigned to a stakeholder shows the stakeholder's name as its owner and
// the create form offers the assignee picker; a decision card shows its
// accountable owner and the create form offers the owner picker; and a
// stakeholder added through the inline quick-add becomes assignable in
// the same form, immediately.
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
  id: "p1", name: "Role Owners Project", description: "A project", is_owner: true,
  size: "full", approach: "hybrid", show_all_tabs: true, stage: "plan",
  created_at: "2026-09-01T00:00:00Z",
};

const BOARD = { id: "s1", name: "Change control board", email: null, role: "Approvals", phone: null, power_level: null, interest_level: null, preferred_contact: null, notes: null };

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
  // The api layer caches GETs stale-while-revalidate across mounts
  // (v153/v157); without this, a later test would be served an earlier
  // test's response for the same path and never re-read its own stub.
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

async function mount(tab: string, handler: (url: string, method: string, body: any) => unknown) {
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const method = init?.method || "GET";
    if (/\/api\/project\?id=/.test(url)) return jsonResponse({ project: PROJECT });
    let body: any = undefined;
    try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { /* not JSON */ }
    const out = handler(url, method, body) as any;
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

/** Flush pending fetches/renders until the predicate holds (bounded). */
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

function taskEndpoints(tasks: any[], stakeholders: any[]) {
  return (url: string, _method?: string, _body?: any) => {
    if (/\/api\/tasks\?projectId=/.test(url)) return { tasks };
    if (/\/api\/raid-task-links\?projectId=/.test(url)) return { riskLinks: [], issueLinks: [] };
    if (/\/api\/task-dependencies\?projectId=/.test(url)) return { links: [] };
    if (/\/api\/roadmap\?projectId=/.test(url)) return { items: [] };
    if (/\/api\/stakeholders\?projectId=/.test(url)) return { stakeholders };
    return undefined;
  };
}

const BASE_TASK = {
  description: null, status: "not_started", start_date: null, due_date: null,
  parent_task_id: null, roadmap_item_id: null, priority: null,
  depends_on_count: 0, blocks_count: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
};

const PICKER = 'select[aria-label="Stakeholder or role (optional)"]';

describe("role owners in the project page (v162)", () => {
  it("Tasks: a stakeholder-owned task shows the role's name, and the create form offers the picker", async () => {
    await mount("tasks", taskEndpoints([
      { ...BASE_TASK, id: "t1", title: "Board review", owner_name: null, stakeholder_id: "s1" },
      { ...BASE_TASK, id: "t2", title: "Loose task", owner_name: null, stakeholder_id: null },
    ], [BOARD]));
    await settle(() => !!host.querySelector(PICKER));

    const text = host.textContent || "";
    expect(text).toContain("Board review");
    expect(text).toContain("Change control board");
    // The unassigned task keeps the existing fallback wording.
    expect(text).toContain("No owner");

    const picker = host.querySelector(PICKER) as HTMLSelectElement | null;
    expect(picker).toBeTruthy();
    expect([...picker!.options].map((o) => o.textContent)).toContain("Change control board (Approvals)");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });

  it("Tasks: a stakeholder added through the quick-add becomes assignable at once", async () => {
    const base = taskEndpoints([], []);
    await mount("tasks", (url, method, body) => {
      if (/\/api\/stakeholders/.test(url) && method === "POST") {
        return { stakeholder: { ...BOARD, name: body.name, role: body.role ?? null } };
      }
      return base(url, method, body);
    });
    await settle(() => (host.textContent || "").includes("No stakeholders yet"));

    // No picker yet -- the quick-add is the way in.
    expect(host.querySelector(PICKER)).toBeNull();
    expect(host.textContent).toContain("No stakeholders yet");

    const nameInput = host.querySelector('input[aria-label="New stakeholder name"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    await act(async () => { setInputValue(nameInput, "Change control board"); });
    const form = nameInput.closest("form")!;
    await act(async () => { form.requestSubmit(); });
    await settle(() => !!host.querySelector(PICKER));

    const picker = host.querySelector(PICKER) as HTMLSelectElement | null;
    expect(picker).toBeTruthy();
    expect([...picker!.options].map((o) => o.textContent)).toContain("Change control board");
    // And it is already selected for the task being added.
    expect(picker!.value).toBe("s1");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });

  it("Decisions: the card shows its owner and the create form offers the owner picker", async () => {
    await mount("decisions", (url) => {
      if (/\/api\/decisions\?projectId=/.test(url)) {
        return {
          decisions: [{
            id: "d1", title: "Approve the baseline", context: "", options: ["Approve", "Reject"],
            status: "open", deadline: null, created_at: new Date().toISOString(), public_token: "tok1",
            recipients: [{ id: "s1", name: "Change control board" }], records: [],
            owner_stakeholder_id: "s1", owner: { id: "s1", name: "Change control board", role: "Approvals" },
            chosen_option: null, responder_name: null, responded_at: null, outcome_confirmed_at: null,
          }],
        };
      }
      if (/\/api\/stakeholders\?projectId=/.test(url)) return { stakeholders: [BOARD] };
      return undefined;
    });
    await settle(() => !!host.querySelector(".decision-card"));

    const card = host.querySelector(".decision-card");
    expect(card).toBeTruthy();
    // The v160 lead line is untouched; the owner is its own line.
    expect(card!.querySelector(".decision-wait")?.textContent).toContain("Waiting on");
    expect(card!.querySelector(".decision-owner")?.textContent).toContain("Owner:");
    expect(card!.querySelector(".decision-owner")?.textContent).toContain("Change control board");
    expect(card!.querySelector(".decision-owner")?.textContent).toContain("Approvals");

    const newButton = [...host.querySelectorAll("button")].find((b) => b.textContent === "New decision request")!;
    await act(async () => { newButton.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await settle(() => {
      const sel = host.querySelector('select[id="f-decision-owner"]') as HTMLSelectElement | null;
      return !!sel && sel.options.length > 1;
    });
    const ownerPicker = host.querySelector('select[id="f-decision-owner"]') as HTMLSelectElement | null;
    expect(ownerPicker).toBeTruthy();
    expect([...ownerPicker!.options].map((o) => o.textContent)).toContain("Change control board (Approvals)");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });
});
