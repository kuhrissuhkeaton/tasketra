// @vitest-environment jsdom
//
// The desktop sidebar can be tucked down to an icon rail, and remembers the choice.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "../lib/api";

const USER: User = { id: "u1", email: "t@x.co", plan: "free" };
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: USER, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import { AppSidebar } from "../components/AppSidebar";

const KEY = "tasketra.sidebarCollapsed";
let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

async function renderSidebar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app"]}><AppSidebar /></MemoryRouter>); });
}
const aside = () => container.querySelector("aside") as HTMLElement;
const toggle = () => container.querySelector(".sidebar-collapse-btn") as HTMLButtonElement;

describe("AppSidebar collapse", () => {
  it("is expanded by default, with a button that offers to collapse it", async () => {
    await renderSidebar();
    expect(aside().classList.contains("sidebar-collapsed")).toBe(false);
    expect(toggle().getAttribute("aria-label")).toBe("Collapse sidebar");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses to the icon rail on click, remembers it, and expands again", async () => {
    await renderSidebar();
    await act(async () => { toggle().click(); });
    expect(aside().classList.contains("sidebar-collapsed")).toBe(true);
    expect(toggle().getAttribute("aria-label")).toBe("Expand sidebar");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(KEY)).toBe("1");

    await act(async () => { toggle().click(); });
    expect(aside().classList.contains("sidebar-collapsed")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("0");
  });

  it("starts collapsed when that was the saved choice", async () => {
    window.localStorage.setItem(KEY, "1");
    await renderSidebar();
    expect(aside().classList.contains("sidebar-collapsed")).toBe(true);
  });

  it("gives each icon a tooltip while collapsed and removes them when expanded", async () => {
    await renderSidebar();
    const tabs = () => [...container.querySelectorAll<HTMLElement>(".side-nav .side-tab")];
    expect(tabs().some((t) => t.hasAttribute("title"))).toBe(false);

    await act(async () => { toggle().click(); });
    const dashboard = tabs().find((t) => t.textContent?.trim() === "Dashboard");
    expect(dashboard?.getAttribute("title")).toBe("Dashboard");

    await act(async () => { toggle().click(); });
    expect(tabs().some((t) => t.hasAttribute("title"))).toBe(false);
  });

  it("still works when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await renderSidebar();
    expect(aside().classList.contains("sidebar-collapsed")).toBe(false);
    await act(async () => { toggle().click(); });
    expect(aside().classList.contains("sidebar-collapsed")).toBe(true);
  });
});
