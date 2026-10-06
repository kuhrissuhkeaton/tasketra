// @vitest-environment jsdom
//
// "My activity": the signed-in user's own recent actions across their projects.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@x.co", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({ getMyActivity: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import MyActivity from "../pages/MyActivity";

const ITEMS = [
  { id: "a1", projectId: "p1", projectName: "Website Relaunch", entityType: "task", entityTitle: "Kickoff", action: "created", summary: null, createdAt: "2026-10-06T14:00:00Z" },
  { id: "a2", projectId: "p1", projectName: "Website Relaunch", entityType: "change_request", entityTitle: "Add pricing page", action: "updated", summary: "status: open -> approved", createdAt: "2026-10-05T14:00:00Z" },
];

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  m.getMyActivity.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderPage() {
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app/activity"]}><MyActivity /></MemoryRouter>); });
}

describe("My activity", () => {
  it("lists actions with verb, type, title, project link and summary", async () => {
    m.getMyActivity.mockResolvedValue({ items: ITEMS });
    await renderPage();
    const list = container.querySelector('ul[aria-label="Your recent activity"]') as HTMLElement;
    expect(list.textContent).toContain("Created task");
    expect(list.textContent).toContain("Kickoff");
    expect(list.textContent).toContain("Updated change request");
    expect(list.textContent).toContain("status: open -> approved");
    expect(list.textContent).toContain("Oct 6");
    expect(list.querySelector('a[href="/app/projects/p1"]')?.textContent).toBe("Website Relaunch");
  });

  it("explains an empty list, including that older actions are not included", async () => {
    m.getMyActivity.mockResolvedValue({ items: [] });
    await renderPage();
    expect(container.textContent).toContain("Nothing here yet");
    expect(container.textContent).toContain("before this page launched");
  });

  it("shows an error when the activity can't be loaded", async () => {
    m.getMyActivity.mockRejectedValue(new Error("boom"));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your activity.");
  });

  it("puts a My activity link in the sidebar", async () => {
    m.getMyActivity.mockResolvedValue({ items: [] });
    await renderPage();
    expect(container.querySelector('a[href="/app/activity"]')?.textContent).toContain("My activity");
  });
});
