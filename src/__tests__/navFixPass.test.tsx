// @vitest-environment jsdom
//
// v174 fix pass (Wren's Step 4 re-check): D1 HealthStrip problem links carry
// a full-strength link underline; D2 the Overview snapshot card's "Share by
// link" opens the real share controls (the same ShareBox / share-links
// machinery the snapshot page uses) instead of linking to the print view;
// D3 .side-project-name has the truncation rule its component documents.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// @ts-ignore node types are not in the app tsconfig
const readText = async (p: string) => (await import("node:fs")).readFileSync(p, "utf8") as string;

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false, refresh: async () => {}, logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import ProjectHome from "../pages/ProjectHome";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { clearApiCache } from "../lib/api";

describe("CSS contracts (D1, D3)", () => {
  it("D1: .hs-link underlines at full strength in the link colour, not a 35% tint", async () => {
    const css = await readText("src/index.css");
    const rule = css.match(/\.hs-link \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("text-decoration: underline");
    expect(rule).toContain("text-decoration-color: var(--navy)");
    expect(rule).not.toContain("35%");
  });

  it("D3: .side-project-name has a rule, and it truncates with an ellipsis", async () => {
    const css = await readText("src/index.css");
    const rule = css.match(/\.side-project-name \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("text-overflow: ellipsis");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("overflow: hidden");
  });
});

let host: HTMLDivElement;
let root: Root;
let posts: { url: string; body: any }[];

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
  clearApiCache();
  posts = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => { await act(async () => { root?.unmount(); }); host.remove(); vi.restoreAllMocks(); });

const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } }));

async function mountHome(isOwner = true) {
  const project = { id: "p1", name: "Fix Pass Project", description: "", is_owner: isOwner, size: "standard", approach: "hybrid", show_all_tabs: true, stage: "plan", created_at: "2026-09-01T00:00:00Z" };
  vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && /\/api\/share-links/.test(url)) {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ link: { token: "tok123", created_at: "2026-11-23T00:00:00Z" } });
    }
    if (method !== "GET") return json({ ok: true });
    if (/\/api\/project\?id=/.test(url)) return json({ project });
    if (/\/api\/share-links/.test(url)) return json({ link: null });
    return new Promise(() => {});
  }));
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/app/projects/p1?tab=home"]}>
        <ConfirmProvider><Routes><Route path="/app/projects/:id" element={<ProjectHome />} /></Routes></ConfirmProvider>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}

const card = () => host.querySelector(".snapshot-card");
const buttonByText = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

describe("D2: Overview snapshot card share action", () => {
  it("the card's only print link is 'Open the client snapshot'; 'Share by link' is a button, not a link", async () => {
    await mountHome(true);
    expect(card()).not.toBeNull();
    const printLinks = [...card()!.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "/app/projects/p1/print/snapshot");
    expect(printLinks.map((a) => a.textContent)).toEqual(["Open the client snapshot"]);
    expect(buttonByText("Share by link")).toBeTruthy();
  });

  it("clicking 'Share by link' opens the real share controls and creating a link posts to the existing share-links endpoint", async () => {
    await mountHome(true);
    await act(async () => { buttonByText("Share by link")!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const createBtn = buttonByText("Create share link");
    expect(createBtn).toBeTruthy();
    await act(async () => { createBtn!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ projectId: "p1", kind: "snapshot" });
    const urlInput = host.querySelector<HTMLInputElement>(".share-url");
    expect(urlInput?.value).toContain("/s/tok123");
  });

  it("non-owners get no share button (the snapshot page's ShareBox is owner-only too)", async () => {
    await mountHome(false);
    expect(card()).not.toBeNull();
    expect(buttonByText("Share by link")).toBeUndefined();
  });
});
