// @vitest-environment jsdom
//
// Today screen: the signed-in user's open tasks across projects.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { localDateKey, addDays } from "../lib/today";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "karissa@x.co", display_name: "Karissa Keaton", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({ getMyToday: vi.fn(), getPortfolio: vi.fn(), updateTask: vi.fn(), createTask: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import Today from "../pages/Today";

const today = localDateKey(new Date());
const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Task ${id}`, status: "not_started", owner_name: null, due_date: today,
  project_id: "p1", project_name: "Harbor Street", project_stage: "execute", ...over,
});
const portfolio = (n: number) => ({
  kpis: {}, taskStatusBreakdown: [], issueSeverityBreakdown: [],
  projects: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: i ? "Launch" : "Harbor Street", stage: "execute", health: i ? "on_track" : "at_risk" })),
  upcomingMilestones: [{ id: "m1", title: "Inspection", date: today, status: "not_done", projectId: "p1", projectName: "Harbor Street" }],
});

let container: HTMLDivElement; let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.updateTask.mockResolvedValue({ task: {} });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function mount(tasks: unknown[], projects = 2) {
  m.getMyToday.mockResolvedValue({ tasks, recentlyDone: [], truncated: false });
  m.getPortfolio.mockResolvedValue(portfolio(projects));
  await act(async () => { root.render(<MemoryRouter><Today /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}
const btn = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) as HTMLButtonElement | undefined;

describe("Today", () => {
  it("groups tasks, greets by first name, shows one lime button and the rail", async () => {
    await mount([task("1", { due_date: addDays(today, -2) }), task("2"), task("3", { due_date: addDays(today, 3) }), task("4", { status: "blocked" })]);
    expect(container.querySelector("h1")?.textContent).toMatch(/^Good (morning|afternoon|evening), Karissa$/);
    const text = container.textContent ?? "";
    for (const g of ["Overdue", "Due today", "This week", "Waiting on others", "Start here", "Coming up", "Projects at a glance"]) expect(text).toContain(g);
    expect(container.querySelector(".tw-focus h2")?.textContent).toBe("Task 1");
    expect(container.querySelectorAll(".btn-primary").length).toBe(1);
  });

  it("marks a task done through the existing update call and offers undo", async () => {
    await mount([task("2")]);
    await act(async () => { btn("Mark done: Task 2")!.click(); });
    expect(m.updateTask).toHaveBeenCalledWith("2", { status: "done" });
    expect(container.textContent).toContain("Just finished");
    await act(async () => { btn("Undo")!.click(); });
    expect(m.updateTask).toHaveBeenLastCalledWith("2", { status: "not_started" });
  });

  it("changes a due date inline and rolls back if the save fails", async () => {
    await mount([task("2")]);
    const input = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    m.updateTask.mockRejectedValueOnce(new Error("nope"));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, addDays(today, 5)); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(m.updateTask).toHaveBeenCalledWith("2", { due_date: addDays(today, 5) });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save");
    expect(container.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe(today);
  });

  it("Mine hides other people's tasks; Everyone shows them", async () => {
    await mount([task("1", { owner_name: "Sam" }), task("2", { owner_name: "Karissa" }), task("3")]);
    expect(container.textContent).not.toContain("Task 1");
    expect(container.textContent).toContain("Task 2");
    await act(async () => { btn("Everyone")!.click(); });
    expect(container.textContent).toContain("Task 1");
  });

  it("adds a task due today to the chosen project", async () => {
    m.createTask.mockResolvedValue({ task: task("9", { title: "New one", owner_name: "Karissa Keaton" }) });
    await mount([task("2")]);
    const input = container.querySelector<HTMLInputElement>("#tw-add-title")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, "New one"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(m.createTask).toHaveBeenCalledWith("p1", "New one", "Karissa Keaton", today);
    expect(container.textContent).toContain("New one");
  });

  it("wrap up moves today's tasks to tomorrow", async () => {
    await mount([task("2"), task("3")]);
    await act(async () => { btn("Wrap up the day")!.click(); });
    expect(container.textContent).toContain("2 moving to tomorrow");
    await act(async () => { btn("Move 2 to tomorrow")!.click(); });
    expect(m.updateTask).toHaveBeenCalledWith("2", { due_date: addDays(today, 1) });
    expect(m.updateTask).toHaveBeenCalledWith("3", { due_date: addDays(today, 1) });
  });

  it("first-time user with no projects sees one clear next step", async () => {
    await mount([], 0);
    expect(container.textContent).toContain("Start with the one thing you need to deliver");
    const link = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "Start a project")!;
    expect(link.getAttribute("href")).toBe("/app/projects");
  });

  it("shows a clear-day message when nothing is due", async () => {
    await mount([task("5", { due_date: addDays(today, 20) })]);
    expect(container.textContent).toContain("Your day is clear");
  });
});
