// @vitest-environment jsdom
//
// v172 ProjectSidebarNav: grouped project sections in the sidebar, the
// decisions waiting badge, and the light project's grow row.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { ProjectSidebarNav } from "../components/ProjectSidebarNav";
import { NAV_GROUPS } from "../lib/projectNav";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const groups = NAV_GROUPS.map((group) => ({
  group,
  sections: group.sections,
  opens: group.sections[0].id,
}));

function render(extra: Partial<React.ComponentProps<typeof ProjectSidebarNav>> = {}) {
  const props: React.ComponentProps<typeof ProjectSidebarNav> = {
    projectName: "Clinic Construction",
    stageLabel: "Plan",
    groups,
    activeTab: "risks",
    activeGroupId: "health",
    decisionsWaiting: 0,
    growPieces: [],
    onOpenTab: vi.fn(),
    onGrow: vi.fn(),
    ...extra,
  };
  act(() => {
    root?.render(
      <MemoryRouter>
        <ProjectSidebarNav {...props} />
      </MemoryRouter>,
    );
  });
  return props;
}

describe("ProjectSidebarNav", () => {
  it("renders the project name, stage, and every section", () => {
    render();
    expect(host?.textContent).toContain("Clinic Construction");
    expect(host?.textContent).toContain("Plan stage");
    const items = [...(host?.querySelectorAll(".side-tab[data-tour^='tab-']") ?? [])];
    expect(items.length).toBe(25);
    expect(host?.querySelector(".side-tab.active")?.getAttribute("data-tour")).toBe("tab-risks");
  });

  it("shows the decisions badge only when decisions are waiting", () => {
    render({ decisionsWaiting: 3 });
    expect(host?.querySelector(".side-badge")?.textContent).toBe("3");
    act(() => root?.unmount());
    root = createRoot(host!);
    render({ decisionsWaiting: 0 });
    expect(host?.querySelector(".side-badge")).toBeNull();
  });

  it("opens a tab when an item is clicked", () => {
    const props = render();
    const btn = host?.querySelector("[data-tour='tab-budget']") as HTMLButtonElement;
    act(() => btn.click());
    expect(props.onOpenTab).toHaveBeenCalledWith("budget");
  });

  it("grow row appears only with grow pieces and grows in place", () => {
    const props = render({ growPieces: [{ id: "budget", label: "Budget" }] });
    const growBtn = [...(host?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes("Need more for this project?"),
    ) as HTMLButtonElement;
    expect(growBtn).toBeTruthy();
    act(() => growBtn.click());
    // Grow pieces are the side-tabs without a data-tour id (the regular
    // Budget section item has one and opens the tab instead).
    const piece = [...(host?.querySelectorAll(".side-tab:not([data-tour])") ?? [])].find((b) =>
      b.textContent?.includes("Budget"),
    ) as HTMLButtonElement;
    act(() => piece.click());
    expect(props.onGrow).toHaveBeenCalledWith("budget");
  });
});
