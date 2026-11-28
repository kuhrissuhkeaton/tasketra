// @vitest-environment jsdom
//
// R3-pre: the phone Menu sheet as a modal dialog. At phone width the open
// sheet gains the union of the Create sheet's and Modal.tsx's patterns --
// backdrop with tap-to-close, dialog semantics, focus in on open, a Tab
// trap, a body scroll-lock, focus back to the Menu button on close --
// while on desktop the same .sidebar-body element stays the plain rail:
// no dialog attributes, no backdrop, no lock (the regression guard).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "../lib/api";

let currentUser: User;
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: currentUser, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("../lib/api", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../lib/api")>();
  return {
    ...orig,
    api: {
      ...orig.api,
      getPortfolio: async () => ({ openDecisions: [] }),
      getNotifications: async () => [],
    },
  };
});

import { AppSidebar } from "../components/AppSidebar";

let phoneMatches = true;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  (window as any).matchMedia = (q: string) => ({
    matches: q === "(max-width: 860px)" ? phoneMatches : false,
    media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    onchange: null, dispatchEvent: () => false,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as any).matchMedia;
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

async function render() {
  currentUser = { id: "u1", email: "a@x.co", plan: "free" } as User;
  await act(async () => {
    root.render(<MemoryRouter initialEntries={["/app"]}><AppSidebar /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

const menuButton = () => container.querySelector<HTMLButtonElement>('.phone-bottom-bar button[aria-controls="sidebar-nav"]')!;
const sheetBody = () => container.querySelector(".sidebar-body")!;
const backdrop = () => container.querySelector(".menu-sheet-backdrop");
const sheetFocusables = () => [...sheetBody().querySelectorAll<HTMLElement>(
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
)].filter((el) => !el.closest("[hidden]"));

async function openSheet() {
  await act(async () => { menuButton().click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
}

describe("Menu sheet at phone width (R3-pre)", () => {
  beforeEach(() => { phoneMatches = true; });

  it("presents the open sheet as a modal dialog with a backdrop, and locks body scroll", async () => {
    await render();
    expect(backdrop()).toBeNull();
    expect(sheetBody().getAttribute("role")).toBeNull();
    await openSheet();
    expect(sheetBody().getAttribute("role")).toBe("dialog");
    expect(sheetBody().getAttribute("aria-modal")).toBe("true");
    expect(sheetBody().getAttribute("aria-label")).toBe("Menu");
    expect(backdrop()).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("moves focus into the sheet on open", async () => {
    await render();
    await openSheet();
    const first = sheetFocusables()[0];
    expect(first.getAttribute("href")).toBe("/app/projects?new=1");
    expect(document.activeElement).toBe(first);
  });

  it("keeps Tab and Shift-Tab cycling inside the sheet", async () => {
    await render();
    await openSheet();
    const items = sheetFocusables();
    const first = items[0];
    const last = items[items.length - 1];
    await act(async () => { last.focus(); });
    await act(async () => { keydown({ key: "Tab" }); });
    expect(document.activeElement).toBe(first);
    await act(async () => { keydown({ key: "Tab", shiftKey: true }); });
    expect(document.activeElement).toBe(last);
  });

  it("closes on a backdrop tap and restores body scroll", async () => {
    await render();
    await openSheet();
    const bd = backdrop()!;
    await act(async () => {
      bd.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(backdrop()).toBeNull();
    expect(sheetBody().getAttribute("role")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape still closes the sheet and returns focus to the Menu button", async () => {
    await render();
    await openSheet();
    expect(document.activeElement).not.toBe(menuButton());
    await act(async () => { keydown({ key: "Escape" }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(backdrop()).toBeNull();
    expect(document.activeElement).toBe(menuButton());
    expect(document.body.style.overflow).toBe("");
  });
});

describe("the same sidebar on desktop (R3-pre regression guard)", () => {
  beforeEach(() => { phoneMatches = false; });

  it("never becomes a modal: no dialog attributes, no backdrop, no scroll-lock", async () => {
    await render();
    await openSheet();
    expect(sheetBody().getAttribute("role")).toBeNull();
    expect(sheetBody().getAttribute("aria-modal")).toBeNull();
    expect(backdrop()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
