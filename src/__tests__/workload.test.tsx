// @vitest-environment jsdom
//
// "Workload": the owner x week grid, its shading, the at-risk tag and the
// milestones strip. Dates are derived from the real today so the grid's
// overdue/week split (drawn against the viewer's local today) is exercised
// the same way the page does it.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@x.co", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({ getWorkload: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import Workload from "../pages/Workload";
import { addDays, localDateKey } from "../lib/today";
import type { WorkloadTask } from "../lib/api";

const todayKey = localDateKey(new Date());
const windowStart = addDays(todayKey, -new Date().getDay());
const yesterday = addDays(todayKey, -1);
const nextWeek = addDays(todayKey, 7);

function task(owner: string, dueDate: string | null, projectId: string, projectHealth: WorkloadTask["projectHealth"]): WorkloadTask {
  return { owner, dueDate, projectId, projectName: `Project ${projectId}`, projectHealth };
}

const DATA = {
  windowStart,
  tasks: [
    // Alice: 1 overdue, 1 due today, 1 undated -- open 3, on an at-risk project.
    task("Alice", yesterday, "p1", "at_risk"),
    task("Alice", todayKey, "p1", "at_risk"),
    task("Alice", null, "p1", "at_risk"),
    // Bob: 3 due today (darkest cell), 1 due next week -- open 4.
    task("Bob", todayKey, "p2", "on_track"),
    task("Bob", todayKey, "p2", "on_track"),
    task("Bob", todayKey, "p2", "on_track"),
    task("Bob", nextWeek, "p2", "on_track"),
    // Unassigned: the most overdue of all, and still the last row.
    task("Unassigned", yesterday, "p2", "on_track"),
    task("Unassigned", yesterday, "p2", "on_track"),
  ],
  milestones: [
    { date: windowStart, title: "Kickoff", projectName: "Project p1" },
    { date: windowStart, title: "Design sign-off", projectName: "Project p1" },
    { date: windowStart, title: "Vendor shortlist", projectName: "Project p2" },
    { date: addDays(windowStart, 8), title: "Beta launch", projectName: "Project p2" },
  ],
};

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  m.getWorkload.mockReset();
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
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app/workload"]}><Workload /></MemoryRouter>); });
}

function bodyRows(): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll<HTMLTableRowElement>(".wl-table tbody tr"));
}

describe("Workload", () => {
  it("renders the grid sorted by load, with Unassigned last despite the most overdue", async () => {
    m.getWorkload.mockResolvedValue(DATA);
    await renderPage();
    const rows = bodyRows();
    expect(rows.map((r) => r.querySelector(".wl-owner-name")?.textContent)).toEqual(["Alice", "Bob", "Unassigned"]);
    // Column headers: the first week carries the "This week" tag.
    const headers = Array.from(container.querySelectorAll(".wl-table thead th")).map((th) => th.textContent);
    expect(headers[0]).toContain("Owner");
    expect(headers[1]).toContain("Overdue");
    expect(headers[2]).toContain("This week");
    expect(headers[6]).toContain("Open");
    expect(container.querySelector(".tw-sub")?.textContent).toContain("3 owners · 9 open tasks");
  });

  it("shades week cells by count and leaves zero cells blank", async () => {
    m.getWorkload.mockResolvedValue(DATA);
    await renderPage();
    const [alice, bob] = bodyRows();
    const aliceCells = alice.querySelectorAll("td");
    // Alice: overdue 1 (hot), week 0 = 1 (lightest shade), weeks 1-3 blank, open 3.
    expect(aliceCells[1].textContent).toBe("1");
    expect(aliceCells[1].className).toContain("wl-overdue-hot");
    expect(aliceCells[2].textContent).toBe("1");
    expect(aliceCells[2].className).toContain("wl-cell-1");
    expect(aliceCells[3].textContent).toBe("—");
    expect(aliceCells[3].className).toContain("wl-cell-0");
    expect(aliceCells[6].textContent).toBe("3");
    // Bob: week 0 = 3 (darkest shade), week 1 = 1.
    const bobCells = bob.querySelectorAll("td");
    expect(bobCells[2].textContent).toBe("3");
    expect(bobCells[2].className).toContain("wl-cell-3");
    expect(bobCells[3].textContent).toBe("1");
    expect(bobCells[3].className).toContain("wl-cell-1");
  });

  it("flags owners whose work sits on at-risk projects, and only them", async () => {
    m.getWorkload.mockResolvedValue(DATA);
    await renderPage();
    const [alice, bob] = bodyRows();
    expect(alice.textContent).toContain("Works on 1 at-risk project");
    expect(bob.textContent).not.toContain("at-risk project");
  });

  it("shows the milestones strip with at most two titles per week, then a +N more", async () => {
    m.getWorkload.mockResolvedValue(DATA);
    await renderPage();
    const strip = Array.from(container.querySelectorAll(".wl-ms-row")).map((li) => li.textContent);
    expect(strip).toHaveLength(2);
    expect(strip[0]).toContain("Week of");
    expect(strip[0]).toContain("Kickoff (Project p1)");
    expect(strip[0]).toContain("Design sign-off (Project p1)");
    expect(strip[0]).toContain("+1 more");
    expect(strip[0]).not.toContain("Vendor shortlist");
    expect(strip[1]).toContain("Beta launch (Project p2)");
  });

  it("explains the empty state when there is no open work", async () => {
    m.getWorkload.mockResolvedValue({ tasks: [], milestones: [], windowStart });
    await renderPage();
    expect(container.textContent).toContain("No open work right now.");
    expect(container.querySelector(".wl-table")).toBeNull();
  });

  it("shows an error when the workload can't be loaded", async () => {
    m.getWorkload.mockRejectedValue(new Error("boom"));
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your workload.");
  });

  it("puts a Workload link in the sidebar", async () => {
    m.getWorkload.mockResolvedValue({ tasks: [], milestones: [], windowStart });
    await renderPage();
    expect(container.querySelector('a[href="/app/workload"]')?.textContent).toContain("Workload");
  });
});
