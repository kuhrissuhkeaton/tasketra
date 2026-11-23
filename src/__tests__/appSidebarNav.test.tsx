// @vitest-environment jsdom
//
// v174 sidebar structure: one system (no tab bar), the Portfolio group,
// Learn exactly once (Guides retired), the admin Founder hub renamed to
// Founder console with an Email members entry, and the phone account
// list that replaces the nested user menu.
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
      getPortfolio: async () => ({ openDecisions: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] }),
      getNotifications: async () => [],
    },
  };
});

import { AppSidebar } from "../components/AppSidebar";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(user: User) {
  currentUser = user;
  await act(async () => {
    root.render(<MemoryRouter initialEntries={["/app"]}><AppSidebar /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

const texts = (sel: string) => [...container.querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? "");
const hrefs = (sel: string) => [...container.querySelectorAll(sel)].map((e) => e.getAttribute("href"));

describe("AppSidebar v174 structure", () => {
  it("Learn appears exactly once and Guides is gone; the old tab bar is not rendered", async () => {
    await render({ id: "u1", email: "a@x.co", plan: "free" } as User);
    expect(texts("#sidebar-nav a").filter((t) => t === "Learn")).toHaveLength(1);
    expect(texts("#sidebar-nav a, .sidebar-footer a")).not.toContain("Guides");
    expect(container.querySelector(".app-tabs")).toBeNull();
  });

  it("the primary list is ungrouped and the cross-project views sit under Portfolio", async () => {
    await render({ id: "u1", email: "a@x.co", plan: "free" } as User);
    const navHrefs = hrefs("#sidebar-nav a");
    expect(navHrefs.slice(0, 5)).toEqual(["/app/projects?new=1", "/app", "/app/projects", "/app/sync", "/app/workload"]);
    expect(texts(".side-nav-label").map((t) => t.replace("▾", ""))).toEqual(["Portfolio", "Help"]);
    expect(navHrefs).toContain("/app/decisions");
    expect(navHrefs).toContain("/app/risks");
  });

  it("the Portfolio Decisions row carries the waiting count", async () => {
    await render({ id: "u1", email: "a@x.co", plan: "free" } as User);
    const decisions = [...container.querySelectorAll("#sidebar-nav a")].find((a) => a.getAttribute("href") === "/app/decisions")!;
    expect(decisions.querySelector(".side-badge")?.textContent).toBe("3");
  });

  it("admins get Founder console (renamed) and Email members; the member Founder hub keeps its name", async () => {
    await render({ id: "u2", email: "a@x.co", plan: "founding", isAdmin: true } as User);
    const navTexts = texts("#sidebar-nav a");
    expect(navTexts).toContain("Founder console");
    expect(navTexts).toContain("Email members");
    expect(hrefs("#sidebar-nav a")).toContain("/admin/email-founding-members");
    expect(hrefs("#sidebar-nav a")).toContain("/admin/founder-hub");
    // The member-facing Founder hub link (footer user menu) is untouched.
    const chip = container.querySelector<HTMLButtonElement>(".user-menu-btn")!;
    await act(async () => { chip.click(); });
    expect(texts(".user-menu-panel a")).toContain("Founder hub");
  });

  it("the phone account list lists Account, Founder hub and Sign out flat for founding members, with no Billing", async () => {
    await render({ id: "u3", email: "f@x.co", plan: "founding" } as User);
    const phoneTexts = texts(".phone-account-links a, .phone-account-links button");
    expect(phoneTexts).toEqual(["Account", "Founder hub", "Sign out"]);
  });

  it("the phone account list shows Billing for paying-plan members", async () => {
    await render({ id: "u4", email: "p@x.co", plan: "active" } as User);
    const phoneTexts = texts(".phone-account-links a, .phone-account-links button");
    expect(phoneTexts).toEqual(["Account", "Billing", "Sign out"]);
  });

  it("the New project button sits at the head of the nav", async () => {
    await render({ id: "u1", email: "a@x.co", plan: "free" } as User);
    const btn = container.querySelector(".sidebar-new-project")!;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("href")).toBe("/app/projects?new=1");
  });
});
