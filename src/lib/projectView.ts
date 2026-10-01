// Which tabs a project shows, and in what order, based on its size and
// approach. Size only hides tabs; nothing is deleted, and the owner can show
// everything with one switch. The server keeps a small mirror of the one rule
// it needs (Light hides Budget) in netlify/lib/stageChecklist.ts so a stage
// suggestion never points at a hidden tab.

export type ProjectSize = "light" | "standard" | "full";
export type ProjectApproach = "predictive" | "hybrid" | "agile";

export const SIZE_LABEL: Record<ProjectSize, string> = { light: "Light", standard: "Standard", full: "Full" };
export const APPROACH_LABEL: Record<ProjectApproach, string> = { predictive: "Predictive", hybrid: "Hybrid", agile: "Agile" };

export const SIZE_BLURB: Record<ProjectSize, string> = {
  light: "Small or short. Tasks, roadmap, risks and the essentials.",
  standard: "Most projects. Adds budget, meetings, vendors and closure.",
  full: "Regulated or large. Adds quality, compliance and comms plan.",
};

export const APPROACH_BLURB: Record<ProjectApproach, string> = {
  predictive: "Roadmap first, tasks open as a list. Best for plan-then-build work.",
  hybrid: "Roadmap and tasks side by side, tasks open as a list. The default.",
  agile: "Tasks come before the roadmap and open as a board. Best for iterative work.",
};

// Tab ids match the Tab type in ProjectHome.tsx.
const HIDDEN: Record<ProjectSize, string[]> = {
  light: [
    "budget", "meetings",
    "okrs", "assumptions", "dependencies", "quality", "compliance",
    "procurement", "comms", "export", "connections", "raci",
  ],
  standard: ["quality", "compliance", "comms"],
  full: [],
};

const TAB_LABEL: Record<string, string> = {
  budget: "Budget", meetings: "Meetings", okrs: "OKRs", assumptions: "Assumptions",
  dependencies: "Dependencies", quality: "Quality", compliance: "Compliance",
  procurement: "Vendors", comms: "Comms plan", templates: "Templates", export: "Export",
  connections: "Connections", raci: "RACI",
};

export function hiddenTabIds(size: ProjectSize): string[] {
  return HIDDEN[size];
}

export function hiddenTabLabels(size: ProjectSize): string[] {
  return HIDDEN[size].map((id) => TAB_LABEL[id] ?? id);
}

/** A tab is hidden only by its project's size, and never once "show all tabs"
 *  is on. The tab a person is currently on is always kept visible by callers. */
export function isTabHidden(tab: string, size: ProjectSize, showAll: boolean): boolean {
  return !showAll && HIDDEN[size].includes(tab);
}

const PRIMARY_ORDER: Record<ProjectApproach, string[]> = {
  predictive: ["home", "roadmap", "tasks", "budget", "meetings"],
  hybrid: ["home", "roadmap", "tasks", "budget", "meetings"],
  agile: ["home", "tasks", "roadmap", "meetings", "budget"],
};

export function primaryTabOrder(approach: ProjectApproach, size: ProjectSize, showAll: boolean): string[] {
  return PRIMARY_ORDER[approach].filter((id) => !isTabHidden(id, size, showAll));
}

export function defaultTasksView(approach: ProjectApproach): "list" | "board" {
  return approach === "agile" ? "board" : "list";
}
