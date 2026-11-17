// @vitest-environment jsdom
//
// v164 (Portfolio Command): the Dashboard's visual home and the two new
// cross-project views. Pins the plan's load-bearing behaviors: gauges with
// their x-of-y words, Budget Used present only once costs exist, variance
// bars linking to the project's Budget tab, the status donut's words, the
// health table's Next Step deep link, Waiting Longest leading with the
// v160 line, Top Risks in v157/v158 exposure order, and the ?new=1 hand-off
// from the top tabs opening the New project modal.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { PortfolioData, Project } from "../lib/api";
import { localDateKey } from "../lib/today";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", plan: "founding", tour_completed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = { listProjects: vi.fn(), getPortfolio: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listProjects: () => calls.listProjects(),
      listDeletedProjects: async () => ({ projects: [] }),
      getPortfolio: (id?: string, stage?: string) => calls.getPortfolio(id, stage),
      getMyToday: async () => ({ tasks: [], recentlyDone: [], truncated: false }),
      getCalendarItems: async () => ({ items: [] }),
      listUserTemplates: async () => ({ templates: [] }),
    },
  };
});
vi.mock("../lib/analytics", () => ({ track: () => {} }));

import Dashboard from "../pages/Dashboard";
import PortfolioDecisions from "../pages/PortfolioDecisions";
import PortfolioRisks from "../pages/PortfolioRisks";
import { CHANGES } from "../lib/whatsNewData";
import { ConfirmProvider } from "../components/ConfirmDialog";

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
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const DAY = 86400000;
const keyIn = (days: number) => localDateKey(new Date(Date.now() + days * DAY));
const isoAgo = (days: number) => new Date(Date.now() - days * DAY - 3600000).toISOString();

const PROJECTS: Project[] = [
  { id: "p1", name: "Website relaunch", description: null, created_at: "2026-10-01T00:00:00Z", is_owner: true, stage: "execute" } as Project,
  { id: "p2", name: "Office move", description: null, created_at: "2026-10-01T00:00:00Z", is_owner: true, stage: "plan" } as Project,
];

function portfolioFixture(): PortfolioData {
  return {
    kpis: {
      activeProjects: 2, atRiskProjects: 1, offTrackProjects: 0, overdueTasks: 1, openRisks: 3, highRisks: 1,
      openIssues: 0, highIssues: 0, totalObjectives: 0, objectivesOnTrack: 0, objectivesAtRisk: 0, objectivesOffTrack: 0,
      objectivesAchieved: 0, avgObjectiveProgress: null,
    },
    taskStatusBreakdown: [{ status: "done", count: 6 }, { status: "not_started", count: 8 }],
    issueSeverityBreakdown: [],
    upcomingMilestones: [],
    undatedMilestones: 0,
    projects: [
      {
        id: "p1", name: "Website relaunch", stage: "execute", closed_at: null, health: "on_track", statedHealth: null, statedAt: null,
        escalations: [], nextUp: "Approve the design", nextUpTab: "decisions",
        totalTasks: 10, doneTasks: 5, overdueTasks: 1, openRisks: 2, highRisks: 1, openIssues: 0, highIssues: 0,
        cpi: null, spi: null, bac: 8000, ac: 9200, plannedStart: keyIn(-10), plannedEnd: keyIn(30),
        objectivesCount: 0, avgObjectiveProgress: null,
      },
      {
        id: "p2", name: "Office move", stage: "plan", closed_at: null, health: "at_risk", statedHealth: null, statedAt: null,
        escalations: [], nextUp: null, nextUpTab: null,
        totalTasks: 4, doneTasks: 1, overdueTasks: 0, openRisks: 1, highRisks: 0, openIssues: 0, highIssues: 0,
        cpi: null, spi: null, bac: null, ac: 0, plannedStart: null, plannedEnd: null,
        objectivesCount: 0, avgObjectiveProgress: null,
      },
    ],
    openDecisions: [
      { id: "d2", projectId: "p2", projectName: "Office move", title: "Pick the venue", context: null, deadline: keyIn(3), createdAt: isoAgo(12), recipients: ["Sam Rivera"], publicToken: "tok2" },
      { id: "d1", projectId: "p1", projectName: "Website relaunch", title: "Approve the design budget", context: null, deadline: null, createdAt: isoAgo(2), recipients: [], publicToken: "tok1" },
    ],
    openRisks: [
      { id: "r1", projectId: "p1", projectName: "Website relaunch", title: "Vendor slips", probability: "low", impact: "low", probability_score: 1, impact_score: 1, status: "open", ownerName: null, created_at: isoAgo(9) },
      { id: "r2", projectId: "p1", projectName: "Website relaunch", title: "Launch date at risk", probability: "high", impact: "high", probability_score: 3, impact_score: 5, status: "open", ownerName: null, created_at: isoAgo(8) },
      { id: "r3", projectId: "p2", projectName: "Office move", title: "Lease timing", probability: "high", impact: "high", probability_score: null, impact_score: null, status: "monitoring", ownerName: null, created_at: isoAgo(7) },
    ],
    openIssues: [],
  } as unknown as PortfolioData;
}

async function renderAt(path: string, routePath: string, element: React.ReactNode) {
  calls.listProjects.mockResolvedValue({ projects: PROJECTS });
  calls.getPortfolio.mockResolvedValue(portfolioFixture());
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <Routes><Route path={routePath} element={element} /></Routes>
        </ConfirmProvider>
      </MemoryRouter>
    );
  });
  await flush();
  await flush();
}

describe("Dashboard visual home (v164)", () => {
  it("gauges carry their x-of-y words; Budget Used appears because costs exist, at 115% and over", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("Portfolio completion");
    expect(text).toContain("6 of 14 tasks done across 2 active projects");
    expect(text).toContain("Time used");
    expect(text).toContain("10 of 40 planned days used across 1 project with dates");
    expect(text).toContain("Budget used");
    expect(text).toContain("115%");
    expect(text).toContain("$9,200 of $8,000 spent across 1 project with budgets");
  });

  it("variance bars link to the project's Budget tab with the over amount in words", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const link = container.querySelector('a[href="/app/projects/p1?tab=budget"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Website relaunch");
    expect(link?.textContent).toContain("Planned $8,000 · Spent $9,200 · $1,200 over");
    // Office move has neither budget nor costs: no bar, per the kit's
    // no-chart-from-no-data rule.
    expect(container.querySelectorAll("a.kit-variance-row").length).toBe(1);
  });

  it("the status donut counts stated statuses with words, and the health table carries the Next Step link", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("Projects by status");
    expect(text).toContain("1 of 2 · 50%");
    const next = [...container.querySelectorAll('a[href="/app/projects/p1?tab=decisions"]')].find((a) => a.textContent === "Approve the design");
    expect(next).not.toBeUndefined();
    expect(text).toContain("Nothing queued");
  });

  it("Waiting Longest leads with the v160 line, longest wait first; Top Risks follows exposure order", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("Waiting longest");
    expect(text).toContain("Waiting on Sam Rivera · waiting 12 days · Needed by");
    expect(text.indexOf("Pick the venue")).toBeLessThan(text.indexOf("Approve the design budget"));
    expect(text).toContain("Not sent to anyone yet — copy the link to ask.");
    expect(text).toContain("Top risks");
    expect(text).toContain("P3 · I5 · Score 15");
    // Exposure order: scored 15 first, scored 1 next, the unscored
    // band-only risk last (v158: numeric scores lead).
    expect(text.indexOf("Launch date at risk")).toBeLessThan(text.indexOf("Vendor slips"));
    expect(text.indexOf("Vendor slips")).toBeLessThan(text.indexOf("Lease timing"));
    expect(text).toContain("P High · I High");
  });

  it("?new=1 from the top tabs opens the New project modal", async () => {
    await renderAt("/app/projects?new=1", "/app/projects", <Dashboard />);
    expect(container.querySelector('input[aria-label="New project name"]')).not.toBeNull();
  });
});

describe("Cross-project views (v164)", () => {
  it("Decisions lists every open ask with the lead line, project and working Copy link", async () => {
    await renderAt("/app/decisions", "/app/decisions", <PortfolioDecisions />);
    const text = container.textContent ?? "";
    expect(text).toContain("2 decisions waiting across 2 projects, longest wait first.");
    expect(text).toContain("Waiting on Sam Rivera · waiting 12 days · Needed by");
    expect(text.indexOf("Pick the venue")).toBeLessThan(text.indexOf("Approve the design budget"));
    const copyButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Copy link");
    expect(copyButtons.length).toBe(2);
    expect(text).toContain("Open in project");
  });

  it("Risks & Issues orders risks by exposure and shows the matrix chip", async () => {
    await renderAt("/app/risks", "/app/risks", <PortfolioRisks />);
    const text = container.textContent ?? "";
    expect(text).toContain("3 open risks and 0 open issues across 2 projects.");
    expect(text).toContain("P3 · I5 · Score 15");
    expect(text.indexOf("Launch date at risk")).toBeLessThan(text.indexOf("Vendor slips"));
    expect(text.indexOf("Vendor slips")).toBeLessThan(text.indexOf("Lease timing"));
    expect(container.querySelector('a[href="/app/projects/p1?tab=risks"]')?.textContent).toBe("Launch date at risk");
    expect(text).toContain("No open issues right now.");
  });
});

describe("v164.1 hotfix", () => {
  function emptyPortfolioFixture(): PortfolioData {
    const base = portfolioFixture();
    return {
      ...base,
      projects: [],
      openDecisions: [],
      openRisks: [],
      openIssues: [],
      upcomingMilestones: [],
      undatedMilestones: 0,
    } as PortfolioData;
  }

  it("filtering to a stage with no projects shows the visual block's empty state, and Clear filters brings the visuals back", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    // From here the rollup answers by filter: a stage filter returns the
    // empty payload, no filter returns the full fixture.
    calls.getPortfolio.mockImplementation(async (_id?: string, stage?: string) =>
      stage ? emptyPortfolioFixture() : portfolioFixture()
    );
    expect(container.textContent ?? "").toContain("Portfolio completion");

    const stageSelect = container.querySelector<HTMLSelectElement>(".dashboard-filters select");
    expect(stageSelect).not.toBeNull();
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setNativeValue?.call(stageSelect, "initiate");
      stageSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    await flush();

    const filteredText = container.textContent ?? "";
    expect(filteredText).toContain("No projects match the filters you picked, so there is nothing to chart here.");
    expect(filteredText).not.toContain("Portfolio completion");

    const clear = [...container.querySelectorAll("button")].find((b) => b.textContent === "Clear the filters");
    expect(clear).not.toBeUndefined();
    await act(async () => { clear!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    await flush();
    expect(container.textContent ?? "").toContain("Portfolio completion");
  });

  it("the health table carries its compact-treatment class", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    expect(container.querySelector("table.dash-health-table")).not.toBeNull();
  });

  it("the v164 What's New entry promises the budget gauge only once costs are logged", () => {
    const v164 = CHANGES.find((c) => c.version === "v164");
    expect(v164).not.toBeUndefined();
    expect(v164!.body).toContain("once a project starts logging costs");
    expect(v164!.body).not.toContain("how much of the budget is spent");
    expect(v164!.title).toBe("Your whole portfolio on one visual dashboard, with decisions and risks across every project.");
  });
});

describe("v164.2 Dashboard polish (Needs attention card, Project health space)", () => {
  async function renderWith(fixture: PortfolioData) {
    calls.listProjects.mockResolvedValue({ projects: PROJECTS });
    calls.getPortfolio.mockResolvedValue(fixture);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/app/projects?view=dashboard"]}>
          <ConfirmProvider>
            <Routes><Route path="/app/projects" element={<Dashboard />} /></Routes>
          </ConfirmProvider>
        </MemoryRouter>
      );
    });
    await flush();
  }

  function healthRow(name: string) {
    const table = container.querySelector("table.dash-health-table");
    expect(table).not.toBeNull();
    return [...table!.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name));
  }

  it("the health table drops the Stage and OKR columns when no project has objectives, and rides the stage under the project name", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const headers = [...container.querySelectorAll("table.dash-health-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Project", "Status", "Tasks", "Overdue", "Next step"]);
    const row = healthRow("Website relaunch");
    expect(row).not.toBeUndefined();
    const firstCell = row!.querySelector("td");
    expect(firstCell?.textContent).toContain("Website relaunch");
    expect(firstCell?.querySelector(".dash-health-stage")?.textContent).toContain("Execute");
  });

  it("the health table shows the OKR column once a project has objectives", async () => {
    const fixture = portfolioFixture();
    fixture.projects[0] = { ...fixture.projects[0], objectivesCount: 2, avgObjectiveProgress: 50 };
    await renderWith(fixture);
    const headers = [...container.querySelectorAll("table.dash-health-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Project", "Status", "Tasks", "Overdue", "OKR progress", "Next step"]);
    expect(healthRow("Website relaunch")?.textContent).toContain("50%");
    expect(healthRow("Office move")?.textContent).toContain("--");
  });

  it("an overdue count is a red pill only when there is one", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const p1 = healthRow("Website relaunch");
    expect(p1?.querySelector(".pill.pill-red")?.textContent).toBe("1");
    const p2 = healthRow("Office move");
    expect(p2?.querySelector(".pill.pill-red")).toBeNull();
    expect(p2?.textContent).toContain("Nothing queued");
  });

  it("Project health sits above the glance calendar", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const health = container.querySelector("#dash-sec-health");
    const glance = container.querySelector(".dash-glance-cal");
    expect(health).not.toBeNull();
    expect(glance).not.toBeNull();
    expect(health!.compareDocumentPosition(glance!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Needs attention rows carry their worst-tone severity class, and the card takes the worst tone present", async () => {
    await renderAt("/app/projects?view=dashboard", "/app/projects", <Dashboard />);
    const section = container.querySelector("section.dash-attention");
    expect(section).not.toBeNull();
    expect(section!.classList.contains("dash-attention-red")).toBe(true);
    const rows = [...container.querySelectorAll(".dash-attention-row")];
    const p1 = rows.find((r) => r.textContent?.includes("Website relaunch"));
    const p2 = rows.find((r) => r.textContent?.includes("Office move"));
    expect(p1?.classList.contains("dash-attention-row-red")).toBe(true);
    expect(p2?.classList.contains("dash-attention-row-gold")).toBe(true);
    expect(p1?.textContent).toContain("1 overdue");
    expect(p2?.textContent).toContain("At risk");
  });
});
