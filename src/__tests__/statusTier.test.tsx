// @vitest-environment jsdom
//
// v172 StatusTier: the merged home status card — verdict strip unboxed,
// one-line progress, decisions waiting, quiet notice lines, checklist
// as the action row.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const m = vi.hoisted(() => ({ getPortfolio: vi.fn(), listTasks: vi.fn(), listDecisions: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import { StatusTier } from "../components/StatusTier";

const summary = (over: Record<string, unknown> = {}) => ({
  id: "p1", name: "Harbor", stage: "execute", nextUp: null, escalations: [], totalTasks: 8, doneTasks: 3, overdueTasks: 0,
  openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0, cpi: null, spi: null, objectivesCount: 0, avgObjectiveProgress: null,
  health: "on_track", ...over,
});

let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  m.getPortfolio.mockReset();
  m.listTasks.mockReset();
  m.listDecisions.mockReset();
  m.getPortfolio.mockResolvedValue({ projects: [summary()] });
  m.listTasks.mockResolvedValue({
    tasks: [
      { id: "t1", title: "Done thing", status: "done", due_date: null },
      { id: "t2", title: "Pour the slab", status: "todo", due_date: "2027-01-05" },
      { id: "t3", title: "Frame walls", status: "todo", due_date: null },
    ],
  });
  m.listDecisions.mockResolvedValue({
    decisions: [
      { id: "d1", status: "open" },
      { id: "d2", status: "open" },
      { id: "d3", status: "decided" },
    ],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(extra: Partial<React.ComponentProps<typeof StatusTier>> = {}) {
  const props: React.ComponentProps<typeof StatusTier> = {
    projectId: "p1",
    stage: "execute",
    purpose: "Build the clinic",
    sizeLabel: null,
    hiddenCount: 0,
    isOwner: true,
    baselineData: null,
    onOpenTab: vi.fn(),
    onShowAllTabs: vi.fn(),
    ...extra,
  };
  await act(async () => {
    root.render(<StatusTier {...props} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return props;
}

describe("StatusTier", () => {
  it("merges verdict, progress, decisions waiting, and next up in one card", async () => {
    const props = await mount();
    const tier = container.querySelector(".status-tier");
    expect(tier).not.toBeNull();
    // The health strip renders unboxed inside the tier.
    expect(tier!.querySelector(".hs-strip.hs-bare")).not.toBeNull();
    expect(tier!.querySelector(".pill")!.textContent).toBe("On track");
    // Progress line.
    expect(tier!.textContent).toContain("1 of 3 tasks done");
    expect(tier!.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("33");
    // Decisions waiting chip navigates.
    const chip = [...tier!.querySelectorAll("button")].find((b) => b.textContent?.includes("decisions waiting")) as HTMLButtonElement;
    expect(chip.textContent).toContain("2 decisions waiting");
    await act(async () => chip.click());
    expect(props.onOpenTab).toHaveBeenCalledWith("decisions");
    // Next up names the earliest dated open task.
    expect(tier!.textContent).toContain("Next up: Pour the slab");
  });

  it("folds the old banners in as quiet notes", async () => {
    await mount({
      purpose: undefined,
      sizeLabel: "Standard",
      hiddenCount: 9,
      baselineData: { baseline: null, variance: null },
    });
    const notes = [...container.querySelectorAll(".status-note")].map((n) => n.textContent);
    expect(notes.some((t) => t?.includes("Showing the Standard view, which hides 9 tabs"))).toBe(true);
    expect(notes.some((t) => t?.includes("under way without a charter"))).toBe(true);
    expect(notes.some((t) => t?.includes("No baseline locked yet"))).toBe(true);
    expect(container.querySelector(".view-banner")).toBeNull();
  });

  it("renders the checklist node as the action row", async () => {
    await mount({ checklist: <div className="checklist-marker">steps here</div> });
    expect(container.querySelector(".status-tier .checklist-marker")?.textContent).toBe("steps here");
  });

  it("stays quiet when there is nothing to report", async () => {
    m.listTasks.mockResolvedValue({ tasks: [] });
    m.listDecisions.mockResolvedValue({ decisions: [] });
    await mount({ baselineData: { baseline: { lockedAt: "2026-11-01", taskCount: 4 }, variance: null } });
    expect(container.querySelector(".status-progress-row")).toBeNull();
    expect(container.textContent).toContain("Baseline locked");
  });
});
