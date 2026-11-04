// @vitest-environment jsdom
//
// "Weekly sync": the cross-project status lines, asks queue and recap.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@x.co", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({ getWeeklySync: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import WeeklySync from "../pages/WeeklySync";

const DATA = {
  projects: [
    {
      id: "p1", name: "Website Relaunch", health: "at_risk", statedHealth: "on_track",
      statedAt: "2026-11-01T09:00:00Z", lastActivityAt: null, overdueTasks: 2, openDecisions: 1,
    },
    {
      id: "p2", name: "Office Move", health: "off_track", statedHealth: null,
      statedAt: null, lastActivityAt: null, overdueTasks: 0, openDecisions: 0,
    },
  ],
  asks: [
    {
      id: "a1", projectId: "p1", projectName: "Website Relaunch", title: "Pick a vendor",
      context: "We need a call on the vendor before the budget locks.", deadline: "2026-11-12",
      createdAt: "2026-10-29T12:00:00Z", recipients: ["Amy Approver", "Zoe Sponsor"],
    },
    {
      id: "a2", projectId: "p2", projectName: "Office Move", title: "Hire a designer",
      context: null, deadline: null, createdAt: "2026-10-30T12:00:00Z", recipients: [],
    },
  ],
};

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  m.getWeeklySync.mockReset();
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
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app/sync"]}><WeeklySync /></MemoryRouter>); });
}

describe("Weekly sync", () => {
  it("renders a status line per project, composed from the payload", async () => {
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    expect(container.textContent).toContain("Stated on track, evidence suggests at risk. 2 tasks past due. 1 decision waiting.");
    expect(container.textContent).toContain("Off track.");
    expect(container.querySelector('a[href="/app/projects/p1"]')?.textContent).toContain("Website Relaunch");
    expect(container.querySelector(".tw-sub")?.textContent).toContain("2 projects · 2 asks waiting");
  });

  it("renders the asks queue with project, needed-by, waiting-on and decisions-tab links", async () => {
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const askLink = container.querySelector('a[href="/app/projects/p1?tab=decisions"]');
    expect(askLink?.textContent).toContain("Pick a vendor");
    expect(askLink?.textContent).toContain("Website Relaunch");
    expect(askLink?.textContent).toContain("Needed by Nov 12, 2026");
    expect(askLink?.textContent).toContain("waiting");
    expect(askLink?.textContent).toContain("Waiting on: Amy Approver, Zoe Sponsor");
    expect(askLink?.textContent).toContain("We need a call on the vendor");
    const undated = container.querySelector('a[href="/app/projects/p2?tab=decisions"]');
    expect(undated?.textContent).toContain("No date set");
    expect(undated?.textContent).not.toContain("Waiting on:");
  });

  it("shows the recap text built from the same payload", async () => {
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const pre = container.querySelector(".sync-recap-text");
    expect(pre?.textContent).toContain("Weekly sync —");
    expect(pre?.textContent).toContain("2 projects: 1 at risk, 1 off track.");
    expect(pre?.textContent).toContain("- Website Relaunch: Stated on track, evidence suggests at risk.");
    expect(pre?.textContent).toContain("- Pick a vendor (Website Relaunch) — needed by Nov 12, 2026");
    expect(pre?.textContent).toContain("- Hire a designer (Office Move) — no date set");
  });

  it("copies the recap and confirms briefly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Copy recap");
    expect(button).toBeTruthy();
    await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain("Asks waiting:");
    expect(button!.textContent).toBe("Copied");
  });

  it("explains the empty states when there are no projects and no asks", async () => {
    m.getWeeklySync.mockResolvedValue({ projects: [], asks: [] });
    await renderPage();
    expect(container.textContent).toContain("No active projects.");
    expect(container.textContent).toContain("No asks waiting.");
  });

  it("shows an error when the sync can't be loaded", async () => {
    m.getWeeklySync.mockRejectedValue(new Error("boom"));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your weekly sync.");
  });

  it("puts a Weekly sync link in the sidebar", async () => {
    m.getWeeklySync.mockResolvedValue({ projects: [], asks: [] });
    await renderPage();
    expect(container.querySelector('a[href="/app/sync"]')?.textContent).toContain("Weekly sync");
  });
});
