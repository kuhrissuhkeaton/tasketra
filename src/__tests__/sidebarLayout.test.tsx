// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
import { AppSidebar } from "../components/AppSidebar";

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
});

function mount(user: object) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  auth.user = user;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemoryRouter initialEntries={["/app"]}><AppSidebar /></MemoryRouter>);
  });
}

const hrefs = (sel: string) =>
  Array.from(container.querySelectorAll(sel + " a")).map((a) => a.getAttribute("href"));

describe("sidebar layout", () => {
  it("keeps daily-work links in the nav and account links below the line", () => {
    mount({ id: "u1", email: "a@example.com", plan: "free" });
    const nav = hrefs("nav.side-nav");
    expect(nav).toContain("/app");
    expect(nav).toContain("/app/activity");
    expect(nav).not.toContain("/app/account");
    expect(nav).not.toContain("/app/billing");
    const foot = hrefs(".sidebar-footer");
    expect(foot).toContain("/app/account");
    expect(foot).toContain("/app/billing");
    expect(foot).not.toContain("/app/founding");
  });

  it("shows the Founder hub instead of Billing for founding members", () => {
    mount({ id: "u1", email: "a@example.com", plan: "founding" });
    const foot = hrefs(".sidebar-footer");
    expect(foot).toContain("/app/founding");
    expect(foot).not.toContain("/app/billing");
  });

  it("shows the Admin group only to admins", () => {
    mount({ id: "u1", email: "a@example.com", plan: "free", isAdmin: true });
    expect(hrefs("nav.side-nav")).toContain("/admin/waitlist");
    act(() => root!.unmount());
    container.remove();
    mount({ id: "u2", email: "b@example.com", plan: "free" });
    expect(hrefs("nav.side-nav")).not.toContain("/admin/waitlist");
  });
});
