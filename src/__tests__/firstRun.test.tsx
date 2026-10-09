// @vitest-environment jsdom
//
// The first-run screen on /app and the checklist inside the project it starts.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { PortfolioData, Project } from "../lib/api";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", plan: "founding", tour_completed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = { listProjects: vi.fn(), getPortfolio: vi.fn(), createProject: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listProjects: () => calls.listProjects(),
      listDeletedProjects: async () => ({ projects: [] }),
      getPortfolio: () => calls.getPortfolio(),
      listUserTemplates: async () => ({ templates: [] }),
      createProject: (...a: unknown[]) => calls.createProject(...a),
    },
  };
});

const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import Dashboard from "../pages/Dashboard";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { FirstRunChecklist } from "../components/FirstRunChecklist";
import { isFirstRun, applyActivity, readChecklist, startChecklist, noteProjectActivity } from "../lib/firstRun";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
});
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  track.mockReset();
  localStorage.clear();
  calls.createProject.mockResolvedValue({ project: { id: "new1", name: "x", description: null, created_at: "" }, templateApplied: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const cardButton = (title: string) => container.querySelector(`button[aria-label="Use this template: ${title}"]`) as HTMLButtonElement;

function project(id: string, name = "Alpha"): Project {
  return { id, name, description: null, created_at: "2026-10-01T00:00:00Z", is_owner: true, stage: "initiate" };
}

function portfolio(projects: { id: string; totalTasks: number }[]): PortfolioData {
  return {
    kpis: {
      activeProjects: projects.length, atRiskProjects: 0, offTrackProjects: 0, overdueTasks: 0, openRisks: 0, highRisks: 0,
      openIssues: 0, highIssues: 0, totalObjectives: 0, objectivesOnTrack: 0, objectivesAtRisk: 0, objectivesOffTrack: 0,
      objectivesAchieved: 0, avgObjectiveProgress: null,
    },
    taskStatusBreakdown: [{ status: "not_started", count: projects.reduce((n, p) => n + p.totalTasks, 0) }],
    issueSeverityBreakdown: [],
    upcomingMilestones: [],
    projects: projects.map((p) => ({
      id: p.id, name: "Alpha", stage: "initiate", health: "on_track", escalations: [], nextUp: null,
      totalTasks: p.totalTasks, doneTasks: 0, overdueTasks: 0, openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0,
      objectivesCount: 0, avgObjectiveProgress: null,
    })),
  } as unknown as PortfolioData;
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

async function renderDashboard(projects: Project[], counts: { id: string; totalTasks: number }[]) {
  calls.listProjects.mockResolvedValue({ projects });
  calls.getPortfolio.mockResolvedValue(portfolio(counts));
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/app"]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/app" element={<Dashboard />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

describe("isFirstRun", () => {
  it("covers no projects, and one project with no tasks", () => {
    expect(isFirstRun([], {})).toBe(true);
    expect(isFirstRun([{ id: "a" }], { a: 0 })).toBe(true);
    expect(isFirstRun([{ id: "a" }], { a: 4 })).toBe(false);
    expect(isFirstRun([{ id: "a" }, { id: "b" }], { a: 0, b: 0 })).toBe(false);
    expect(isFirstRun([{ id: "a" }], {})).toBe(false);
  });
});

describe("Dashboard first run", () => {
  it("shows the first-run screen with 0 projects, without the dashboard pieces", async () => {
    await renderDashboard([], []);
    expect(container.querySelector("h1")?.textContent).toBe("Start your first project in 30 seconds.");
    expect(container.textContent).toContain("WELCOME TO TASKETRA");
    expect(container.textContent).toContain("Fastest. See it working.");
    expect(container.textContent).toContain("I built Tasketra because I was tired of gluing five tools together.");
    expect(container.querySelector('a[href="/app/resources#how-it-works"]')?.textContent).toBe("How a project runs from Initiate to Close");
    expect(cardButton("Start with example data").textContent).toBe("Use this template");
    for (const gone of ["New project", "Create project"]) expect(button(gone)).toBeUndefined();
    for (const gone of ["Active projects", "Tasks by status", "Upcoming milestones", "Project health"]) {
      expect(container.textContent).not.toContain(gone);
    }
    const headings = [...container.querySelectorAll("main h1, main h2, main h3")].map((h) => h.tagName);
    expect(headings[0]).toBe("H1");
    expect(headings.slice(1).every((t) => t === "H2")).toBe(true);
  });

  it("shows it for one project with no tasks, with a way into that project", async () => {
    await renderDashboard([project("p1", "Alpha")], [{ id: "p1", totalTasks: 0 }]);
    expect(container.querySelector("h1")?.textContent).toBe("Start your first project in 30 seconds.");
    expect(container.querySelector('a[href="/app/projects/p1"]')?.textContent).toBe("open Alpha");
  });

  it("keeps the full dashboard once a project has tasks", async () => {
    await renderDashboard([project("p1")], [{ id: "p1", totalTasks: 5 }]);
    expect(container.querySelector("h1")?.textContent).toBe("Dashboard");
    expect(container.textContent).toContain("Charts and analytics");
    expect(container.textContent).toContain("Project health");
    expect(button("New project")).toBeTruthy();
    expect(container.querySelector("form.new-project-form")).toBeNull();
    expect(container.textContent).not.toContain("WELCOME TO TASKETRA");
  });

  const CASES: { title: string; name: string; seed: boolean; setup: Record<string, string> }[] = [
    { title: "Start with example data", name: "Example project", seed: true, setup: { size: "standard", approach: "hybrid" } },
    { title: "Process improvement / rollout", name: "Process improvement / rollout", seed: false, setup: { size: "standard", approach: "hybrid", template: "process-improvement" } },
    { title: "Event / marketing campaign", name: "Event / marketing campaign", seed: false, setup: { size: "standard", approach: "predictive", template: "event-campaign" } },
    { title: "Software / product launch", name: "Software / product launch", seed: false, setup: { size: "standard", approach: "agile", template: "software-launch" } },
    { title: "Construction / facilities", name: "Construction / facilities", seed: false, setup: { size: "standard", approach: "predictive", template: "construction" } },
  ];

  for (const c of CASES) {
    it(`"${c.title}" creates the right project and opens it with the checklist`, async () => {
      await renderDashboard([], []);
      await act(async () => { cardButton(c.title).click(); });
      await flush();
      expect(calls.createProject).toHaveBeenCalledWith(c.name, undefined, c.seed, c.setup);
      expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app/projects/new1");
      expect(readChecklist("u1")).toMatchObject({ projectId: "new1", dismissed: false, taskEdits: 0 });
      expect(track).toHaveBeenCalledWith("template_chosen", { template: c.setup.template ?? "example" });
    });
  }

  it("the blank link creates a blank project", async () => {
    await renderDashboard([], []);
    await act(async () => { button("Start from a blank project").click(); });
    await flush();
    expect(calls.createProject).toHaveBeenCalledWith("My first project", undefined, false, { size: "standard", approach: "hybrid" });
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app/projects/new1");
    expect(track).toHaveBeenCalledWith("template_chosen", { template: "blank" });
  });

  it("says so when creating fails, and never offers an upgrade to a founding member", async () => {
    calls.createProject.mockRejectedValue(new Error("Something broke."));
    await renderDashboard([], []);
    await act(async () => { cardButton("Software / product launch").click(); });
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Something broke.");
    expect(container.querySelector('a[href="/app/billing"]')).toBeNull();
  });
});

describe("New project dialog", () => {
  async function open() {
    await renderDashboard([project("p1")], [{ id: "p1", totalTasks: 5 }]);
    const opener = button("New project");
    opener.focus();
    await act(async () => { opener.click(); });
    return opener;
  }
  const dialog = () => container.querySelector('[role="dialog"]') as HTMLElement | null;
  const nameInput = () => container.querySelector('input[aria-label="New project name"]') as HTMLInputElement;

  it("opens a labelled modal dialog with focus on the name field and options collapsed", async () => {
    await open();
    const d = dialog()!;
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.querySelector("h2")?.textContent).toBe("New project");
    expect(d.getAttribute("aria-labelledby")).toBe(d.querySelector("h2")!.id);
    expect(document.activeElement).toBe(nameInput());
    const more = button("More options");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(d.querySelector("#new-project-more")!.hasAttribute("hidden")).toBe(true);
    await act(async () => { more.click(); });
    expect(button("Hide options").getAttribute("aria-expanded")).toBe("true");
    expect(d.querySelector("#new-project-more")!.hasAttribute("hidden")).toBe(false);
  });

  it("Escape closes it and focus returns to the New project button", async () => {
    const opener = await open();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps what you typed when you cancel and reopen", async () => {
    await open();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(nameInput(), "Draft name");
      nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Cancel").click(); });
    expect(dialog()).toBeNull();
    await act(async () => { button("New project").click(); });
    expect(nameInput().value).toBe("Draft name");
  });

  it("creates the project with the same arguments and opens it", async () => {
    await open();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(nameInput(), "Launch plan");
      nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Create project").click(); });
    await flush();
    expect(calls.createProject).toHaveBeenCalledWith("Launch plan", undefined, false, { size: "standard", approach: "hybrid" });
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe("/app/projects/new1");
  });

  it("shows a creation error inside the dialog", async () => {
    calls.createProject.mockRejectedValue(new Error("Nope."));
    await open();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(nameInput(), "X");
      nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Create project").click(); });
    await flush();
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain("Nope.");
  });
});

describe("Dashboard command center", () => {
  function setMatchMedia(wide: boolean) {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes("861") ? wide : false, media: q, addEventListener() {}, removeEventListener() {} });
  }
  afterEach(() => { delete (window as any).matchMedia; });

  async function render(wide: boolean, extra: { overdue?: number; decisions?: number; ms?: number } = {}) {
    setMatchMedia(wide);
    const projs = [
      { ...project("p1", "Alpha"), open_decisions: extra.decisions ?? 0 },
      project("p2", "Beta"),
    ];
    calls.listProjects.mockResolvedValue({ projects: projs });
    const base = portfolio([{ id: "p1", totalTasks: 5 }, { id: "p2", totalTasks: 3 }]) as any;
    base.projects[0].name = "Alpha"; base.projects[0].overdueTasks = extra.overdue ?? 0; base.projects[0].nextUp = "Add tasks";
    base.projects[1].name = "Beta";
    base.upcomingMilestones = Array.from({ length: extra.ms ?? 0 }, (_, i) => ({ id: `m${i}`, title: `Milestone ${i}`, date: "2026-11-01", status: "planned", projectId: "p1", projectName: "Alpha" }));
    calls.getPortfolio.mockResolvedValue(base);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/app"]}>
          <ConfirmProvider>
            <Routes><Route path="/app" element={<Dashboard />} /><Route path="*" element={<Where />} /></Routes>
          </ConfirmProvider>
        </MemoryRouter>,
      );
    });
    await flush();
  }
  const sec = (title: string) => [...container.querySelectorAll("button.dash-sec-btn")].find((b) => b.querySelector(".dash-sec-title")?.textContent === title) as HTMLButtonElement;
  const h2s = () => [...container.querySelectorAll("main h2")].map((h) => h.querySelector(".dash-sec-title")?.textContent ?? h.textContent);

  it("desktop: Project health and milestones open, charts collapsed", async () => {
    await render(true, { ms: 2 });
    expect(sec("Project health").getAttribute("aria-expanded")).toBe("true");
    expect(sec("Upcoming milestones").getAttribute("aria-expanded")).toBe("true");
    expect(sec("Charts and analytics").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.textContent).toContain("Milestone 0");
    expect(container.textContent).not.toContain("Tasks by status");
  });

  it("phone: all three reporting sections collapsed", async () => {
    await render(false, { ms: 2 });
    for (const t of ["Project health", "Upcoming milestones", "Charts and analytics"]) {
      expect(sec(t).getAttribute("aria-expanded")).toBe("false");
    }
    expect(container.querySelector("table")).toBeNull();
  });

  it("puts Needs attention and Your projects before the reporting sections", async () => {
    await render(true, { overdue: 2 });
    const order = h2s();
    expect(order.indexOf("Needs attention")).toBeGreaterThan(-1);
    expect(order.indexOf("Needs attention")).toBeLessThan(order.indexOf("Your projects"));
    expect(order.indexOf("Your projects")).toBeLessThan(order.indexOf("Project health"));
    expect(order.indexOf("Project health")).toBeLessThan(order.indexOf("Upcoming milestones"));
    expect(order.indexOf("Upcoming milestones")).toBeLessThan(order.indexOf("Charts and analytics"));
  });

  it("lists projects that need attention with reasons, and says so when none do", async () => {
    await render(true, { overdue: 2, decisions: 1 });
    const row = container.querySelector(".dash-attention-row")!;
    expect(row.textContent).toContain("Alpha");
    expect(row.textContent).toContain("2 overdue");
    expect(row.textContent).toContain("1 awaiting decision");
    expect(container.querySelectorAll(".dash-attention-row").length).toBe(1);
    act(() => root.unmount());
    root = createRoot(container);
    await render(true);
    expect(container.querySelector(".dash-attention-empty")?.textContent).toBe("Nothing needs attention right now.");
  });

  it("toggles with the button, keeps the choice, and wires aria-controls", async () => {
    await render(true);
    const btn = sec("Charts and analytics");
    const panel = container.querySelector(`#${CSS.escape(btn.getAttribute("aria-controls")!)}`) as HTMLElement;
    expect(panel.hasAttribute("hidden")).toBe(true);
    await act(async () => { btn.click(); });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(container.textContent).toContain("Tasks by status");
    expect(localStorage.getItem("tasketra.dash.charts.wide")).toBe("1");
    act(() => root.unmount());
    root = createRoot(container);
    await render(true);
    expect(sec("Charts and analytics").getAttribute("aria-expanded")).toBe("true");
    await act(async () => { sec("Project health").click(); });
    expect(sec("Project health").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("table")).toBeNull();
  });

  it("caps milestones at five with a Show all control", async () => {
    await render(true, { ms: 8 });
    expect(container.querySelectorAll(".dash-ms-row").length).toBe(5);
    await act(async () => { button("Show all 8").click(); });
    expect(container.querySelectorAll(".dash-ms-row").length).toBe(8);
  });
});

describe("applyActivity", () => {
  it("fires each analytics milestone once", () => {
    let p = { projectId: "p", reviewed: false, taskEdits: 0, invited: false, dismissed: false };
    const fired: string[] = [];
    for (const kind of ["task", "task", "task", "task", "invite", "invite", "review"] as const) {
      const r = applyActivity(p, kind);
      p = r.next;
      fired.push(...r.events);
    }
    expect(fired).toEqual(["first_task_edited", "three_tasks_added", "teammate_invited"]);
    expect(p).toMatchObject({ reviewed: true, taskEdits: 4, invited: true });
  });
});

describe("FirstRunChecklist", () => {
  async function renderChecklist(projectId: string, tab = "home", hidden = false) {
    const onOpenTab = vi.fn();
    await act(async () => {
      root.render(<FirstRunChecklist userId="u1" projectId={projectId} tab={tab} hidden={hidden} onOpenTab={onOpenTab} />);
    });
    return onOpenTab;
  }

  it("shows only in the project it was started for", async () => {
    startChecklist("u1", "p1");
    await renderChecklist("p2");
    expect(container.querySelector(".first-run-checklist")).toBeNull();
  });

  it("tracks the three steps and persists them", async () => {
    startChecklist("u1", "p1");
    const onOpenTab = await renderChecklist("p1");
    const items = () => [...container.querySelectorAll(".first-run-steps li")].map((li) => li.textContent);
    expect(items()).toEqual(["Review your plan", "Add or edit 3 tasks0 of 3", "Invite a teammate"]);

    await act(async () => { button("Review your plan").click(); });
    expect(onOpenTab).toHaveBeenCalledWith("roadmap");

    await act(async () => { noteProjectActivity("p1", "task"); noteProjectActivity("p2", "task"); });
    expect(container.textContent).toContain("1 of 3");
    expect(track).toHaveBeenCalledWith("first_task_edited");

    await act(async () => { noteProjectActivity("p1", "task"); noteProjectActivity("p1", "task"); noteProjectActivity("p1", "invite"); });
    expect(track).toHaveBeenCalledWith("three_tasks_added");
    expect(track).toHaveBeenCalledWith("teammate_invited");
    expect(readChecklist("u1")).toMatchObject({ taskEdits: 3, invited: true });
  });

  it("marks the plan reviewed when a plan tab is opened", async () => {
    startChecklist("u1", "p1");
    await renderChecklist("p1", "roadmap");
    expect(readChecklist("u1")?.reviewed).toBe(true);
    expect(container.querySelector(".first-run-steps li.done")?.textContent).toContain("Review your plan");
  });

  it("can be dismissed, and stays dismissed", async () => {
    startChecklist("u1", "p1");
    await renderChecklist("p1");
    await act(async () => { (container.querySelector('button[aria-label="Dismiss checklist"]') as HTMLButtonElement).click(); });
    expect(container.querySelector(".first-run-checklist")).toBeNull();
    expect(readChecklist("u1")?.dismissed).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    await renderChecklist("p1");
    expect(container.querySelector(".first-run-checklist")).toBeNull();
  });

  it("is not drawn during the product tour but still counts", async () => {
    startChecklist("u1", "p1");
    await renderChecklist("p1", "home", true);
    expect(container.querySelector(".first-run-checklist")).toBeNull();
    await act(async () => { noteProjectActivity("p1", "task"); });
    expect(readChecklist("u1")?.taskEdits).toBe(1);
  });
});
