// @vitest-environment jsdom
//
// The v164 portfolio top tabs (AppTabs, rendered by AppSidebar): the seven
// cross-project views, the + New project link, and which tab reads active
// on which route -- Dashboard and Projects are the same page in its two
// views, so their active split follows the ?view= param.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { AppTabs } from "../components/AppTabs";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function renderAt(path: string) {
  // A fresh root per path: MemoryRouter only reads initialEntries on
  // mount, so re-rendering into the same root would keep the first route.
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><AppTabs /></MemoryRouter>); });
}

const tab = (label: string) => [...container.querySelectorAll("a.app-tab")].find((a) => a.textContent === label);
const activeLabels = () => [...container.querySelectorAll("a.app-tab-active")].map((a) => a.textContent);

describe("AppTabs", () => {
  it("renders the seven tabs in plan order plus the New project link", async () => {
    await renderAt("/app");
    expect([...container.querySelectorAll("a.app-tab")].map((a) => a.textContent)).toEqual([
      "Dashboard", "Today", "Projects", "Decisions", "Risks & Issues", "Weekly Sync", "Workload",
    ]);
    expect(tab("Dashboard")?.getAttribute("href")).toBe("/app/projects?view=dashboard");
    expect(tab("Decisions")?.getAttribute("href")).toBe("/app/decisions");
    expect(tab("Risks & Issues")?.getAttribute("href")).toBe("/app/risks");
    const newLink = container.querySelector("a.app-tabs-new");
    expect(newLink?.getAttribute("href")).toBe("/app/projects?new=1");
    expect(newLink?.textContent).toContain("New project");
  });

  it("marks Today active on /app and nothing else", async () => {
    await renderAt("/app");
    expect(activeLabels()).toEqual(["Today"]);
    expect(tab("Today")?.getAttribute("aria-current")).toBe("page");
  });

  it("splits Dashboard and Projects by the view param, and keeps Projects active inside a project", async () => {
    await renderAt("/app/projects?view=dashboard");
    expect(activeLabels()).toEqual(["Dashboard"]);
    await renderAt("/app/projects");
    expect(activeLabels()).toEqual(["Projects"]);
    await renderAt("/app/projects/p1");
    expect(activeLabels()).toEqual(["Projects"]);
  });

  it("marks the cross-project views active on their routes", async () => {
    await renderAt("/app/decisions");
    expect(activeLabels()).toEqual(["Decisions"]);
    await renderAt("/app/risks");
    expect(activeLabels()).toEqual(["Risks & Issues"]);
    await renderAt("/app/sync");
    expect(activeLabels()).toEqual(["Weekly Sync"]);
    await renderAt("/app/workload");
    expect(activeLabels()).toEqual(["Workload"]);
  });
});
