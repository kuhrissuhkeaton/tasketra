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
    // v156: asserted as two fragments -- the composed line can also carry
    // a "No update in N days" claim between them once the fixture's
    // statedAt (2026-11-01) is a week or more in the past, which made the
    // single-string version fail on the calendar rather than on behavior
    // (it was already red at the v155 base for exactly that reason; the
    // quiet claim itself is pinned deterministically in syncRecap.test.ts).
    expect(container.textContent).toContain("Stated on track, evidence suggests at risk.");
    expect(container.textContent).toContain("2 tasks past due. 1 decision waiting.");
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

  it("shows the formatted recap card built from the same payload (v167)", async () => {
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const card = container.querySelector(".sync-recap-card");
    expect(card?.textContent).toContain("Weekly sync recap");
    // The Checked-in prose groups by headline health -- Website Relaunch
    // stated on track, so it reads as on track, not at risk (the same
    // grouping the copied recap counts by, v156).
    expect(card?.textContent).toContain("Website Relaunch is on track.");
    expect(card?.textContent).toContain("Office Move is off track.");
    expect(card?.textContent).toContain("Pick a vendor");
    expect(card?.textContent).toContain("(Website Relaunch)");
    expect(card?.textContent).toContain("needed by Nov 12, 2026");
    expect(card?.textContent).toContain("Hire a designer");
    expect(card?.textContent).toContain("no date set");
  });

  it("shows the stat strip counted from the payload and the drafts (v167)", async () => {
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const stats = new Map(
      Array.from(container.querySelectorAll(".sync-stat")).map((el) => [
        el.querySelector(".sync-stat-label")?.textContent,
        el.querySelector(".sync-stat-value")?.textContent,
      ]),
    );
    expect(stats.get("Asks waiting")).toBe("2");
    // Pre-fill: one win (Website Relaunch's headline is on track), two
    // blockers (Office Move off track, Website Relaunch's past-due tasks).
    expect(stats.get("Wins logged")).toBe("1");
    expect(stats.get("Blockers open")).toBe("2");
    expect(stats.has("Projects checked in")).toBe(true);
    expect(stats.has("Oldest ask, in days")).toBe(true);
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

  it("pre-fills the Wins / Blockers / Next week bullet editors from the payload, and the edits reach the copied recap (v160, F-23; v167 bullets)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    m.getWeeklySync.mockResolvedValue(DATA);
    await renderPage();
    const editorFor = (title: string) =>
      Array.from(container.querySelectorAll(".sync-editor")).find(
        (el) => el.querySelector(".sync-editor-title")?.textContent === title,
      );
    const wins = editorFor("Wins");
    const blockers = editorFor("Blockers");
    expect(wins?.textContent).toContain("Website Relaunch is on track");
    expect(blockers?.textContent).toContain("Office Move: off track");
    expect(blockers?.textContent).toContain("Website Relaunch: 2 tasks past due");
    // Edit the wins line the way a user does: click it, retype, Enter.
    const line = Array.from(wins!.querySelectorAll<HTMLButtonElement>(".sync-bullet-text")).find(
      (b) => b.textContent === "Website Relaunch is on track",
    );
    await act(async () => { line!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const input = wins!.querySelector<HTMLInputElement>(".sync-bullet-input");
    expect(input?.value).toBe("Website Relaunch is on track");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "Shipped the beta");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(wins!.textContent).toContain("Shipped the beta");
    expect(container.querySelector(".sync-recap-card")?.textContent).toContain("Shipped the beta");
    // Remove a blockers line with its × button.
    const doomed = Array.from(blockers!.querySelectorAll(".sync-bullet")).find(
      (li) => li.textContent?.includes("Office Move: off track"),
    );
    const removeBtn = doomed!.querySelector<HTMLButtonElement>(".sync-bullet-remove");
    await act(async () => { removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(blockers!.textContent).not.toContain("Office Move: off track");
    // The copied recap carries the edit and the removal.
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Copy recap");
    await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain("Wins:");
    expect(copied).toContain("- Shipped the beta");
    expect(copied).toContain("Blockers:");
    expect(copied).not.toContain("Website Relaunch is on track");
    expect(copied).not.toContain("- Office Move: off track");
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

  it("puts a Weekly Sync link in the sidebar", async () => {
    m.getWeeklySync.mockResolvedValue({ projects: [], asks: [] });
    await renderPage();
    expect(container.querySelector('a[href="/app/sync"]')?.textContent).toContain("Weekly Sync");
  });
});
