// @vitest-environment jsdom
//
// Change requests entry form (QuickAddForm reference implementation): the
// compact row shows title + impacts + the button; description, reason and
// requested-by sit behind "More details"; every field is still submitted.
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

async function mount() {
  const project = { id: "p1", name: "CR Project", description: "", is_owner: true, size: "standard", approach: "hybrid", show_all_tabs: true, stage: "plan", created_at: "2026-09-01T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (/\/api\/project\?id=/.test(url)) return json({ project });
    if (/\/api\/members/.test(url)) return json({ members: [] });
    if (/\/api\/change-requests/.test(url)) {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return json({ changeRequest: { id: "new" } });
      }
      return json({ changeRequests: rows });
    }
    return new Promise(() => {});
  }));
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/app/projects/p1?tab=decisions"]}>
        <ConfirmProvider><Routes><Route path="/app/projects/:id" element={<ProjectHome />} /></Routes></ConfirmProvider>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  // Change requests live behind a toggle on the Decisions tab.
  const btn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Change requests")!;
  await act(async () => { btn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}

const setVal = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const form = () => host.querySelector<HTMLFormElement>("form.quick-add")!;
const byLabel = (l: string) => form().querySelector<HTMLInputElement>(`[aria-label="${l}"]`)!;
const toggle = () => form().querySelector<HTMLButtonElement>(".quick-add-toggle")!;
const panel = () => form().querySelector<HTMLElement>(".quick-add-more")!;

describe("Change requests quick-add form", () => {
  it("empty register: compact fields visible, More details stays collapsed", async () => {
    await mount();
    expect(form()).not.toBeNull();
    expect(form().querySelector(".quick-add-title")).not.toBeNull();
    expect(byLabel("Schedule impact (days)")).not.toBeNull();
    expect(byLabel("Budget impact ($)")).not.toBeNull();
    expect(form().textContent).toContain("Log change request");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
  });

  it("with existing rows it is also collapsed", async () => {
    rows = [{ id: "c1", title: "Existing", status: "pending", created_at: "2026-09-02T00:00:00Z" }];
    await mount();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("More details holds description, reason and requested by", async () => {
    await mount();
    await act(async () => { toggle().click(); });
    expect(panel().hidden).toBe(false);
    expect(panel().querySelectorAll("textarea").length).toBe(2);
    expect(panel().querySelector('[aria-label="Requested by (optional)"]')).not.toBeNull();
  });

  it("submits every field to the same API call, even when More details is collapsed", async () => {
    await mount();
    await act(async () => { toggle().click(); });
    const [desc, reason] = [...panel().querySelectorAll("textarea")] as HTMLTextAreaElement[];
    await act(async () => {
      setVal(form().querySelector<HTMLInputElement>(".quick-add-title")!, "Add SSO");
      setVal(byLabel("Schedule impact (days)"), "5");
      setVal(byLabel("Budget impact ($)"), "1200");
      setVal(desc, "Add single sign-on");
      setVal(reason, "Customer ask");
      setVal(byLabel("Requested by (optional)"), "Sam");
    });
    await act(async () => { toggle().click(); }); // collapse again; values must persist
    expect(panel().hidden).toBe(true);
    await act(async () => { form().requestSubmit(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(posts).toEqual([{
      projectId: "p1", title: "Add SSO", description: "Add single sign-on", reason: "Customer ask",
      scheduleImpactDays: 5, budgetImpact: 1200, requestedBy: "Sam",
    }]);
  });

  it("a blank title is still rejected and nothing is posted", async () => {
    await mount();
    await act(async () => { form().requestSubmit(); });
    expect(posts).toEqual([]);
  });
});
