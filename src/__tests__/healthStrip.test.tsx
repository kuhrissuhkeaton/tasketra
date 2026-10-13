// @vitest-environment jsdom
//
// Project health strip: one calm line under the project title.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const m = vi.hoisted(() => ({ getPortfolio: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import { HealthStrip } from "../components/HealthStrip";
import { projectReasonParts } from "../lib/projectReason";

const summary = (over: Record<string, unknown> = {}) => ({
  id: "p1", name: "Harbor", stage: "execute", nextUp: null, escalations: [], totalTasks: 8, doneTasks: 3, overdueTasks: 0,
  openRisks: 0, highRisks: 0, openIssues: 0, highIssues: 0, cpi: null, spi: null, objectivesCount: 0, avgObjectiveProgress: null,
  health: "on_track", ...over,
});

let container: HTMLDivElement; let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { m.getPortfolio.mockReset(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount(open = vi.fn()) {
  await act(async () => { root.render(<HealthStrip projectId="p1" onOpenTab={open} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  return open;
}
const strip = () => container.querySelector(".hs-strip");

describe("HealthStrip", () => {
  it("asks for just this project and shows the verdict with linked reasons", async () => {
    m.getPortfolio.mockResolvedValue({ projects: [summary({ health: "off_track", overdueTasks: 3, highIssues: 2, nextUp: "Electrical inspection" })] });
    const open = await mount();
    expect(m.getPortfolio).toHaveBeenCalledWith("p1");
    expect(strip()!.getAttribute("role")).toBe("status");
    expect(strip()!.querySelector(".pill")!.textContent).toBe("Off track");
    const links = [...strip()!.querySelectorAll("button.hs-link")];
    expect(links.map((l) => l.textContent)).toEqual(["3 tasks overdue", "2 high or critical issues"]);
    await act(async () => { (links[1] as HTMLButtonElement).click(); });
    expect(open).toHaveBeenCalledWith("issues");
    expect(strip()!.querySelector(".hs-next")!.textContent).toContain("Electrical inspection");
  });

  it("is calm for a healthy project and shows what is next once", async () => {
    m.getPortfolio.mockResolvedValue({ projects: [summary({ nextUp: "Finalize launch copy" })] });
    await mount();
    expect(strip()!.querySelector(".pill")!.textContent).toBe("On track");
    expect(strip()!.textContent).toContain("Next up: Finalize launch copy");
    expect(strip()!.textContent!.match(/Next up/g)!.length).toBe(1);
    expect(strip()!.querySelector("button")).toBeNull();
  });

  it("shows a neutral New state, never red, for a project with no tasks", async () => {
    m.getPortfolio.mockResolvedValue({ projects: [summary({ totalTasks: 0, doneTasks: 0 })] });
    await mount();
    const pill = strip()!.querySelector(".pill")!;
    expect(pill.textContent).toBe("New");
    expect(pill.className).toContain("hs-new");
    expect(strip()!.textContent).toContain("No tasks yet");
  });

  it("renders nothing when the data cannot load or the project is missing", async () => {
    m.getPortfolio.mockRejectedValue(new Error("nope"));
    await mount();
    expect(strip()).toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    m.getPortfolio.mockResolvedValue({ projects: [] });
    await mount();
    expect(strip()).toBeNull();
  });
});

describe("projectReasonParts", () => {
  it("links each problem to the tab that fixes it and keeps the top two", () => {
    const parts = projectReasonParts(summary({ escalations: ["Budget"], overdueTasks: 2, highRisks: 1 }) as any);
    expect(parts).toEqual([{ text: "Needs escalation", tab: "team" }, { text: "2 tasks overdue", tab: "tasks" }]);
    expect(projectReasonParts(summary({ highRisks: 1 }) as any, 1)).toEqual([{ text: "1 high risk", tab: "risks" }, { text: "1 decision waiting", tab: "decisions" }]);
  });
});

describe("HealthStrip placement", () => {
  it("sits under the project title on every tab, Home included (one verdict, not two)", async () => {
    // @ts-ignore node builtin: the app tsconfig has no node types, vitest runs in node
    const { readFileSync } = await import("node:fs");
    const src: string = readFileSync("src/pages/ProjectHome.tsx", "utf8");
    expect(src).toMatch(/\{id && <HealthStrip projectId=\{id\}/);
    expect(src.indexOf("<HealthStrip")).toBeLessThan(src.indexOf('className="project-tabs primary-tabs"'));
    expect(src.indexOf("<HealthStrip")).toBeGreaterThan(src.indexOf("project-page-head"));
  });
});
