// @vitest-environment jsdom
//
// Which sidebar entries each kind of account sees.
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

async function navFor(user: User): Promise<string[]> {
  currentUser = user;
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app"]}><AppSidebar /></MemoryRouter>); });
  return [...container.querySelectorAll("#sidebar-nav a")].map((a) => a.textContent?.trim() ?? "");
}

const ADMIN_ONLY = ["Waitlist", "Feedback inbox", "Founding members"];

describe("AppSidebar", () => {
  it("hides Billing from founding members", async () => {
    const nav = await navFor({ id: "u1", email: "f@x.co", plan: "founding" });
    expect(nav).not.toContain("Billing");
    expect(nav).toContain("Account");
  });

  it("shows Billing on every other plan", async () => {
    for (const plan of ["free", "trialing", "active", "past_due"] as const) {
      expect(await navFor({ id: "u1", email: "p@x.co", plan })).toContain("Billing");
    }
  });

  it("shows the admin pages only to an admin", async () => {
    const regular = await navFor({ id: "u1", email: "r@x.co", plan: "free", isAdmin: false });
    for (const item of ADMIN_ONLY) expect(regular).not.toContain(item);
    const admin = await navFor({ id: "u2", email: "a@x.co", plan: "founding", isAdmin: true });
    for (const item of ADMIN_ONLY) expect(admin).toContain(item);
  });
});
