// The places a project is organised into (v174, navigation consolidation).
// The 26 existing tab ids are regrouped from the old build-shaped groups
// into job-shaped ones -- Plan, Track, People, Wrap up -- plus an Overview
// entry and an ungrouped settings tail. `?tab=<id>` keeps meaning what it
// always did, so every old link, bookmark and in-app jump still lands on
// the same screen. The group is derived from the tab id; nothing else
// about routing changes.
//
// Two sections are not tabs at all: Client Snapshot is a link section
// (it opens the snapshot print route, it has no ?tab= id), and it is the
// one section `allNavTabIds` leaves out on purpose.
//
// Size hiding is unchanged (see projectView.ts): a section is hidden by the project's
// size unless "show all tabs" is on, the section being viewed is always kept, and a
// group with no visible sections is not shown.

import { isTabHidden, type ProjectSize } from "./projectView";

export type NavGroupId = "overview" | "plan" | "track" | "people" | "wrapup" | "settings";
export type NavSection = {
  id: string;
  label: string;
  /** Link sections render as a route link instead of a ?tab= button. */
  href?: (projectId: string) => string;
};
export type NavGroup = { id: NavGroupId; label: string; sections: NavSection[] };

export const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: "Overview", sections: [{ id: "home", label: "Overview" }] },
  { id: "plan", label: "Plan", sections: [
    { id: "roadmap", label: "Roadmap" },
    { id: "charter", label: "Charter" },
    { id: "budget", label: "Budget" },
    { id: "meetings", label: "Meetings" },
    { id: "okrs", label: "Goals (OKRs)" },
  ] },
  { id: "track", label: "Track", sections: [
    { id: "tasks", label: "Tasks" },
    { id: "issues", label: "Issues" },
    { id: "risks", label: "Risks" },
    { id: "assumptions", label: "Assumptions" },
    { id: "dependencies", label: "Dependencies" },
    { id: "quality", label: "Quality" },
    { id: "compliance", label: "Compliance" },
  ] },
  { id: "people", label: "People", sections: [
    { id: "stakeholders", label: "Stakeholders" },
    { id: "decisions", label: "Decisions" },
    { id: "raci", label: "Roles (RACI)" },
    { id: "procurement", label: "Vendors" },
    { id: "comms", label: "Communication plan" },
  ] },
  { id: "wrapup", label: "Wrap up", sections: [
    { id: "documents", label: "Documents" },
    { id: "report", label: "Status report" },
    { id: "snapshot", label: "Client Snapshot", href: (projectId) => `/app/projects/${projectId}/print/snapshot` },
    { id: "closure", label: "Closure" },
    { id: "templates", label: "Saved templates" },
    { id: "export", label: "Export" },
    { id: "trash", label: "Trash" },
  ] },
  { id: "settings", label: "Project settings", sections: [
    { id: "team", label: "Project settings" },
    { id: "connections", label: "Webhooks" },
  ] },
];

export function groupOf(tab: string): NavGroupId | null {
  for (const g of NAV_GROUPS) if (g.sections.some((s) => s.id === tab)) return g.id;
  return null;
}

/** Every tab id the nav knows about. Link sections (Client Snapshot) are
 *  not tab ids and are deliberately excluded. */
export function allNavTabIds(): string[] {
  return NAV_GROUPS.flatMap((g) => g.sections.filter((s) => !s.href).map((s) => s.id));
}

export function sectionLabel(tab: string): string | null {
  for (const g of NAV_GROUPS) {
    const s = g.sections.find((x) => x.id === tab);
    if (s) return s.label;
  }
  return null;
}

export function visibleSections(group: NavGroup, current: string, size: ProjectSize, showAll: boolean, extraTabs: string[] = []): NavSection[] {
  return group.sections.filter((s) => s.id === current || !isTabHidden(s.id, size, showAll, extraTabs));
}

/** The groups, minus any whose sections are all hidden, each with the tab a click should open. */
export function visibleGroups(current: string, size: ProjectSize, showAll: boolean, extraTabs: string[] = []) {
  return NAV_GROUPS
    .map((g) => ({ group: g, sections: visibleSections(g, current, size, showAll, extraTabs) }))
    .filter((x) => x.sections.length > 0)
    .map((x) => ({ ...x, opens: x.sections[0].id }));
}

/** The sections a project's size currently hides (and that have not been
 *  grown back), in nav order -- the "More sections" list the sidebar tail
 *  and the project home offer with Add actions (v174: the one surviving
 *  grow pattern; the sidebar grow row, the Overview directory's show-all
 *  button and the calm home list were three mechanisms doing this job). */
export function hiddenSections(size: ProjectSize, showAll: boolean, extraTabs: string[] = []): NavSection[] {
  if (showAll) return [];
  return NAV_GROUPS.flatMap((g) => g.sections).filter(
    (s) => !s.href && isTabHidden(s.id, size, showAll, extraTabs),
  );
}

/** Tabs that keep the project name as the page heading (the old top strip).
 *  Every tab gets the breadcrumb since v174; this set only decides the heading. */
export const STRIP_TABS: ReadonlySet<string> = new Set(["home", "roadmap", "tasks", "budget", "meetings"]);
