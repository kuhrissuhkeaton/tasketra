// @vitest-environment jsdom
//
// Lessons, Communications plan, Vendors and Objectives entry forms (QuickAddForm):
// compact identifying fields visible, the rest behind "More details" (collapsed
// even when the register is empty); every field is still submitted.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false, refresh: async () => {}, logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import ProjectHome from "../pages/ProjectHome";
import { ConfirmProvider } from "../components/ConfirmDialog";

let host: HTMLDivElement;
let root: Root;
let posts: any[];
let rows: any[];
type Reg = {
  name: string; tab: string; toggleLabel?: string; endpoint: RegExp; listKey: string; row: any;
  visible: string[]; hidden: string[]; button: string; fill: Array<[string, string]>; expected: Record<string, unknown>;
  quickRequired: string; // placeholder of the field that must be filled
};

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
  sessionStorage.clear();
  posts = [];
  rows = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => { await act(async () => { root?.unmount(); }); host.remove(); vi.restoreAllMocks(); });


const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));

async function mount(reg: Reg) {
  const project = { id: "p1", name: "Reg Project", description: "", is_owner: true, size: "standard", approach: "hybrid", show_all_tabs: true, stage: "plan", created_at: "2026-09-01T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (/\/api\/project\?id=/.test(url)) return json({ project });
    if (/\/api\/members/.test(url)) return json({ members: [] });
    if (reg.endpoint.test(url)) {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return json({ ok: true }); }
      return json({ [reg.listKey]: rows });
    }
    return new Promise(() => {});
  }));
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/app/projects/p1?tab=${reg.tab}`]}>
        <ConfirmProvider><Routes><Route path="/app/projects/:id" element={<ProjectHome />} /></Routes></ConfirmProvider>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  if (reg.toggleLabel) {
    const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === reg.toggleLabel)!;
    await act(async () => { btn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  }
}

const setVal = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};
const form = () => host.querySelector<HTMLFormElement>("form.quick-add")!;
const toggle = () => form().querySelector<HTMLButtonElement>(".quick-add-toggle")!;
const panel = () => form().querySelector<HTMLElement>(".quick-add-more")!;
const field = (sel: string) => form().querySelector<any>(sel)!;
const inQuick = (sel: string) => form().querySelector(".quick-add-row")!.querySelector(sel);

const REGS: Reg[] = [
  {
    name: "Lessons", tab: "report", toggleLabel: "Lessons learned", endpoint: /\/api\/lessons/, listKey: "lessons",
    row: { id: "l1", summary: "Existing", details: null, category: "went_well", status: "open", owner_name: null, created_at: "2026-09-02T00:00:00Z" },
    quickRequired: "What happened?",
    visible: ['[placeholder="What happened?"]', 'select[aria-label="Category"]'], button: "Log lesson",
    hidden: ["textarea", '[aria-label="Owner (optional)"]'],
    fill: [['[placeholder="What happened?"]', "Test the backups"], ["textarea", "We never did"], ['select[aria-label="Category"]', "went_poorly"], ['[aria-label="Owner (optional)"]', "Pat"]],
    expected: { projectId: "p1", summary: "Test the backups", details: "We never did", category: "went_poorly", ownerName: "Pat" },
  },
  {
    name: "Communications plan", tab: "comms", endpoint: /\/api\/communications/, listKey: "commPlanItems",
    row: { id: "c1", audience: "Sponsor", topic: "Status", frequency: "weekly", channel: "email", owner_name: null, notes: null, created_at: "2026-09-02T00:00:00Z" },
    quickRequired: "Who needs it?",
    visible: ['[placeholder="Who needs it?"]', '[placeholder="What do they need?"]', 'select[aria-label="Frequency"]'], button: "Add to plan",
    hidden: ['select[aria-label="Channel"]', '[aria-label="Owner (optional)"]', "textarea"],
    fill: [['[placeholder="Who needs it?"]', "Board"], ['[placeholder="What do they need?"]', "Budget summary"], ['select[aria-label="Frequency"]', "monthly"], ['select[aria-label="Channel"]', "meeting"], ['[aria-label="Owner (optional)"]', "Kim"], ["textarea", "Keep short"]],
    expected: { projectId: "p1", audience: "Board", topic: "Budget summary", frequency: "monthly", channel: "meeting", ownerName: "Kim", notes: "Keep short" },
  },
  {
    name: "Vendors", tab: "procurement", endpoint: /\/api\/procurement/, listKey: "procurementItems",
    row: { id: "v1", vendor_name: "Acme", description: null, category: "vendor", status: "evaluating", owner_name: null, cost: 100, start_date: null, end_date: null, vendor_category: null, vendor_subcategory: null, role: null, created_at: "2026-09-02T00:00:00Z" },
    quickRequired: "Who are you buying from, or what's the agreement?",
    visible: ['[placeholder^="Who are you buying from"]', 'select[aria-label="Category"]', '[aria-label="Cost (optional)"]'], button: "Log vendor",
    hidden: ["textarea", '[aria-label="Owner (optional)"]', 'select[title="Status"]', '[aria-label^="Role"]', '[aria-label^="Category (optional)"]', '[aria-label="Sub-category (optional)"]', 'input[title="Start date (optional)"]', 'input[title="End date (optional)"]'],
    fill: [['[placeholder^="Who are you buying from"]', "Globex"], ["textarea", "Hosting"], ['[aria-label="Cost (optional)"]', "250.5"], ['[aria-label="Owner (optional)"]', "Lee"], ['[aria-label^="Role"]', "Vendor for"], ['[aria-label^="Category (optional)"]', "Software"], ['[aria-label="Sub-category (optional)"]', "Hosting"], ['input[title="Start date (optional)"]', "2026-11-01"], ['input[title="End date (optional)"]', "2026-12-01"]],
    expected: { projectId: "p1", vendorName: "Globex", description: "Hosting", cost: 250.5, ownerName: "Lee", role: "Vendor for", vendorCategory: "Software", vendorSubcategory: "Hosting", startDate: "2026-11-01", endDate: "2026-12-01" },
  },
  {
    name: "Objectives", tab: "okrs", endpoint: /\/api\/objectives/, listKey: "objectives",
    row: { id: "o1", title: "Existing", description: null, owner_name: null, target_date: null, status: "on_track", progress: 0, key_results: [], created_at: "2026-09-02T00:00:00Z" },
    quickRequired: "What outcome are you driving toward?",
    visible: ['[placeholder^="What outcome"]', 'input[type="date"]'], button: "Add objective",
    hidden: ["textarea", '[aria-label="Owner (optional)"]', 'select[title="Status"]'],
    fill: [['[placeholder^="What outcome"]', "Grow signups"], ["textarea", "Reach 500"], ['[aria-label="Owner (optional)"]', "Ana"], ['input[type="date"]', "2026-12-31"], ['select[title="Status"]', "at_risk"]],
    expected: { projectId: "p1", title: "Grow signups", description: "Reach 500", ownerName: "Ana", targetDate: "2026-12-31", status: "at_risk" },
  },
];

for (const reg of REGS) {
  describe(`${reg.name} quick-add form`, () => {
    it("empty register: compact fields visible, More details collapsed", async () => {
      await mount(reg);
      expect(form()).not.toBeNull();
      for (const sel of reg.visible) expect(inQuick(sel), sel).not.toBeNull();
      expect(form().querySelector(".quick-add-row")!.textContent).toContain(reg.button);
      expect(toggle().getAttribute("aria-expanded")).toBe("false");
      expect(panel().hidden).toBe(true);
      for (const sel of reg.hidden) expect(panel().querySelector(sel), sel).not.toBeNull();
    });

    it("with existing rows it is also collapsed", async () => {
      rows = [reg.row];
      await mount(reg);
      expect(toggle().getAttribute("aria-expanded")).toBe("false");
    });

    it("submits every field to the same API call, with More details collapsed again", async () => {
      await mount(reg);
      await act(async () => { toggle().click(); });
      expect(panel().hidden).toBe(false);
      await act(async () => { for (const [sel, v] of reg.fill) setVal(field(sel), v); });
      await act(async () => { toggle().click(); });
      expect(panel().hidden).toBe(true);
      await act(async () => { form().requestSubmit(); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(posts.length).toBe(1);
      expect(posts[0]).toMatchObject(reg.expected);
    });

    it("a blank required field is still rejected and nothing is posted", async () => {
      await mount(reg);
      await act(async () => { form().requestSubmit(); });
      expect(posts).toEqual([]);
    });
  });
}
