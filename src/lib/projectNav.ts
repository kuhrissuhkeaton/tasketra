// The six places a project is organised into. Each of the 26 existing tab ids
// belongs to exactly one group, and `?tab=<id>` keeps meaning what it always
// did, so every old link, bookmark and in-app jump still lands on the same screen.
// The group is derived from the tab id; nothing else about routing changes.
//
// Size hiding is unchanged (see projectView.ts): a section is hidden by the project's
// size unless "show all tabs" is on, the section being viewed is always kept, and a
// group with no visible sections is not shown.

import { isTabHidden, type ProjectSize } from "./projectView";

export type NavGroupId = "overview" | "tasks" | "plan" | "health" | "people" | "docs";
export type NavSection = { id: string; label: string };
export type NavGroup = { id: NavGroupId; label: string; sections: NavSection[] };

export const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Overview", sections: [{ id: "home", label: "Overview" }] },
  { id: "tasks", label: "Tasks", sections: [{ id: "tasks", label: "Tasks" }] },
  { id: "plan", label: "Plan", sections: [
    { id: "roadmap", label: "Roadmap" },
    { id: "budget", label: "Budget" },
    { id: "meetings", label: "Meetings" },
    { id: "charter", label: "Charter" },
    { id: "okrs", label: "OKRs" },
  ] },
  { id: "health", label: "Health", sections: [
    { id: "issues", label: "Issues" },
    { id: "risks", label: "Risks" },
    { id: "assumptions", label: "Assumptions" },
    { id: "dependencies", label: "Dependencies" },
    { id: "quality", label: "Quality" },
    { id: "compliance", label: "Compliance" },
  ] },
  { id: "people", label: "People and decisions", sections: [
    { id: "decisions", label: "Decisions" },
    { id: "stakeholders", label: "Stakeholders" },
    { id: "team", label: "Team" },
    { id: "raci", label: "RACI" },
    { id: "procurement", label: "Vendors" },
    { id: "comms", label: "Comms plan" },
  ] },
  { id: "docs", label: "Docs", sections: [
    { id: "documents", label: "Documents" },
    { id: "report", label: "Weekly report" },
    { id: "closure", label: "Closure" },
    { id: "templates", label: "Templates" },
    { id: "export", label: "Export" },
    { id: "connections", label: "Connections" },
  ] },
];

/** Trash is reached from the project menu, not a section pill, but it lives under Docs. */
const EXTRA: Record<string, NavGroupId> = { trash: "docs" };

export function groupOf(tab: string): NavGroupId | null {
  for (const g of NAV_GROUPS) if (g.sections.some((s) => s.id === tab)) return g.id;
  return EXTRA[tab] ?? null;
}

/** Every tab id the nav knows about (sections plus the menu-only ones). */
export function allNavTabIds(): string[] {
  return [...NAV_GROUPS.flatMap((g) => g.sections.map((s) => s.id)), ...Object.keys(EXTRA)];
}

export function sectionLabel(tab: string): string | null {
  for (const g of NAV_GROUPS) {
    const s = g.sections.find((x) => x.id === tab);
    if (s) return s.label;
  }
  return tab === "trash" ? "Trash" : null;
}

export function visibleSections(group: NavGroup, current: string, size: ProjectSize, showAll: boolean): NavSection[] {
  return group.sections.filter((s) => s.id === current || !isTabHidden(s.id, size, showAll));
}

/** The six groups, minus any whose sections are all hidden, each with the tab a click should open. */
export function visibleGroups(current: string, size: ProjectSize, showAll: boolean) {
  return NAV_GROUPS
    .map((g) => ({ group: g, sections: visibleSections(g, current, size, showAll) }))
    .filter((x) => x.sections.length > 0)
    .map((x) => ({ ...x, opens: x.sections[0].id }));
}

/** Tabs that keep the project name as the page heading (the old top strip). The rest get a breadcrumb. */
export const STRIP_TABS: ReadonlySet<string> = new Set(["home", "roadmap", "tasks", "budget", "meetings"]);
