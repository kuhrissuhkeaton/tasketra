// @vitest-environment jsdom
//
// Project page chrome: every view gets a breadcrumb (v174; strip views
// keep the project name as the heading, the rest use the view name),
// Trash is a regular sidebar section in Wrap up (it lived in a one-item
// "Project actions" menu until v174), and Trash restore still works.
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

describe("breadcrumb and page heading", () => {
  it("sidebar view: breadcrumb with real links, current page text, heading is the view name", async () => {
    await mount("risks");
    const n = crumb()!;
    expect(n).not.toBeNull();
    const links = [...n.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["Projects", "Chrome Project"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/app/projects", "/app/projects/p1"]);
    const cur = n.querySelector('[aria-current="page"]')!;
    expect(cur.textContent).toBe("Risks");
    expect(cur.querySelector("a")).toBeNull();
    expect(h1()).toBe("Risks");
  });

  it("uses the sidebar label for the view (Communication plan since v174)", async () => {
    await mount("comms");
    expect(crumb()!.querySelector('[aria-current="page"]')!.textContent).toBe("Communication plan");
    expect(h1()).toBe("Communication plan");
  });

  it("strip views get a breadcrumb too (v174) and keep the project name as the heading", async () => {
    for (const tab of ["home", "tasks", "roadmap", "budget", "meetings"]) {
      await mount(tab);
      expect(crumb(), tab).not.toBeNull();
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

describe("Trash in the sidebar (v174)", () => {
  it("there is no Project actions menu, and the sidebar lists Trash as a section", async () => {
    await mount("home");
    expect(host.querySelector('button[aria-label="Project actions"]')).toBeNull();
    const trash = host.querySelector<HTMLElement>("[data-tour='tab-trash']");
    expect(trash).not.toBeNull();
    expect(trash!.textContent).toContain("Trash");
  });

  it("choosing the sidebar Trash section opens the Trash view (?tab=trash)", async () => {
    await mount("risks");
    const trash = host.querySelector<HTMLButtonElement>("[data-tour='tab-trash']")!;
    await act(async () => { trash.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(h1()).toBe("Trash");
    expect(host.textContent).toContain("Old risk");
  });

  it("is available to non-owners too (Trash access is unchanged)", async () => {
    await mount("home", false);
    expect(host.querySelector("[data-tour='tab-trash']")).not.toBeNull();
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
