// Project size and approach. Size decides which tabs a project shows (see
// src/lib/projectView.ts for the tab lists); approach decides tab order and
// the default Tasks view. Kept tiny and pure so the server can validate the
// values and tailor the stage checklist to what the project actually shows.

export type ProjectSize = "light" | "standard" | "full";
export type ProjectApproach = "predictive" | "hybrid" | "agile";

export const PROJECT_SIZES: ProjectSize[] = ["light", "standard", "full"];
export const PROJECT_APPROACHES: ProjectApproach[] = ["predictive", "hybrid", "agile"];

export function isProjectSize(v: unknown): v is ProjectSize {
  return typeof v === "string" && (PROJECT_SIZES as string[]).includes(v);
}

export function isProjectApproach(v: unknown): v is ProjectApproach {
  return typeof v === "string" && (PROJECT_APPROACHES as string[]).includes(v);
}
