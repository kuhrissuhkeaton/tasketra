// @vitest-environment jsdom
//
// Project page chrome (v113): Trash lives in the Project actions menu, sidebar views
// and Trash get a breadcrumb and use the view name as the heading, strip views are
// unchanged, and Trash restore still works.
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
let writes: { url: string; method: string; body: any }[];

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
  writes = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => { await act(async () => { root?.unmount(); }); host.remove(); vi.restoreAllMocks(); });

const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));
const TRASHED = [{ entity_type: "risk", id: "r9", title: "Old risk", deleted_at: "2026-10-01T00:00:00Z" }];

async function mount(tab: string, isOwner = true) {
  const project = { id: "p1", name: "Chrome Project", description: "", is_owner: isOwner, size: "standard", approach: "hybrid", show_all_tabs: true, stage: "plan", created_at: "2026-09-01T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") { writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null }); return json({ ok: true }); }
    if (/\/api\/project\?id=/.test(url)) return json({ project });
    if (/\/api\/trash/.test(url)) return json({ items: TRASHED });
    return new Promise(() => {});
  }));
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/app/projects/p1?tab=${tab}`]}>
        <ConfirmProvider><Routes><Route path="/app/projects/:id" element={<ProjectHome />} /></Routes></ConfirmProvider>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}

const crumb = () => host.querySelector<HTMLElement>('nav[aria-label="Breadcrumb"]');
const h1 = () => host.querySelector("h1")!.textContent;
const menuBtn = () => host.querySelector<HTMLButtonElement>('button[aria-label="Project actions"]')!;
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];

describe("breadcrumb and page heading", () => {
  it("sidebar view: breadcrumb with real links, current page text, heading is the view name", async () => {
    await mount("risks");
    const n = crumb()!;
    expect(n).not.toBeNull();
    const links = [...n.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["Dashboard", "Chrome Project"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/app", "/app/projects/p1"]);
    const cur = n.querySelector('[aria-current="page"]')!;
    expect(cur.textContent).toBe("Risks");
    expect(cur.querySelector("a")).toBeNull();
    expect(h1()).toBe("Risks");
  });

  it("uses the sidebar label for the view (Weekly report, Comms plan)", async () => {
    await mount("comms");
    expect(crumb()!.querySelector('[aria-current="page"]')!.textContent).toBe("Comms plan");
    expect(h1()).toBe("Comms plan");
  });

  it("strip views have no breadcrumb and keep the project name as the heading", async () => {
    for (const tab of ["home", "tasks", "roadmap", "budget", "meetings"]) {
      await mount(tab);
      expect(crumb(), tab).toBeNull();
      expect(h1(), tab).toBe("Chrome Project");
      await act(async () => { root.unmount(); });
      host.innerHTML = "";
    }
  });

  it("Trash view: breadcrumb ends in Trash and the heading is Trash", async () => {
    await mount("trash");
    expect(crumb()!.querySelector('[aria-current="page"]')!.textContent).toBe("Trash");
    expect(h1()).toBe("Trash");
    expect(host.textContent).toContain("Old risk");
  });
});

describe("Project actions menu", () => {
  it("is in the page header, closed by default, and the sidebar no longer lists Trash", async () => {
    await mount("home");
    expect(menuBtn()).not.toBeNull();
    expect(menuBtn().getAttribute("aria-haspopup")).toBe("menu");
    expect(menuBtn().getAttribute("aria-expanded")).toBe("false");
    expect(host.closest("body")!.querySelector('[role="menu"]')).toBeNull();
    const sideLabels = [...host.querySelectorAll(".side-tab, .side-nav-label")].map((e) => e.textContent?.trim());
    expect(sideLabels).not.toContain("Trash");
    expect(sideLabels).not.toContain("Reference");
  });

  it("click opens a menu with Trash; choosing it opens the Trash view (?tab=trash)", async () => {
    await mount("risks");
    await act(async () => { menuBtn().click(); });
    expect(menuBtn().getAttribute("aria-expanded")).toBe("true");
    expect(items().map((i) => i.textContent)).toEqual(["Trash"]);
    await act(async () => { items()[0].click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(h1()).toBe("Trash");
    expect(host.textContent).toContain("Old risk");
  });

  it("keyboard: ArrowDown opens and focuses the first item, Escape closes and returns focus", async () => {
    await mount("home");
    menuBtn().focus();
    await act(async () => { menuBtn().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(items().length).toBe(1);
    expect(document.activeElement).toBe(items()[0]);
    await act(async () => { items()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(items().length).toBe(0);
    expect(document.activeElement).toBe(menuBtn());
  });

  it("is available to non-owners too (Trash access is unchanged)", async () => {
    await mount("home", false);
    expect(menuBtn()).not.toBeNull();
  });

  it("Delete project is not in the menu", async () => {
    await mount("home");
    await act(async () => { menuBtn().click(); });
    expect(items().map((i) => i.textContent.toLowerCase()).join()).not.toContain("delete");
  });
});

describe("Trash restore is unchanged", () => {
  it("Restore still sends the same restore request for the item", async () => {
    await mount("trash");
    const restoreBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Restore")!;
    expect(restoreBtn).toBeTruthy();
    await act(async () => { restoreBtn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(writes.length).toBe(1);
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toMatch(/\/api\/risks/);
    expect(writes[0].body).toMatchObject({ id: "r9", restore: true });
  });
});
