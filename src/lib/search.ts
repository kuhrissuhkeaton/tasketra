// Global search palette plumbing (v159, F-18): turns the grouped
// /api/search payload into the flat, keyboard-navigable list the palette
// renders. Pure so the grouping, ordering and link targets are testable
// without a DOM. Group order is fixed (projects, tasks, decisions, risks)
// and matches the order the groups render in.

import type { SearchResults } from "./api";

export type SearchItem = {
  /** Stable key for React and for aria-activedescendant. */
  key: string;
  group: "Projects" | "Tasks" | "Decisions" | "Risks";
  title: string;
  /** The project the item lives in; for a project hit, the project itself. */
  projectName: string;
  href: string;
};

export function flattenSearchResults(results: SearchResults): SearchItem[] {
  const items: SearchItem[] = [];
  for (const p of results.projects) {
    items.push({ key: `project-${p.id}`, group: "Projects", title: p.name, projectName: p.name, href: `/app/projects/${p.id}` });
  }
  for (const t of results.tasks) {
    items.push({ key: `task-${t.id}`, group: "Tasks", title: t.title, projectName: t.projectName, href: `/app/projects/${t.projectId}?tab=tasks` });
  }
  for (const d of results.decisions) {
    items.push({ key: `decision-${d.id}`, group: "Decisions", title: d.title, projectName: d.projectName, href: `/app/projects/${d.projectId}?tab=decisions` });
  }
  for (const r of results.risks) {
    items.push({ key: `risk-${r.id}`, group: "Risks", title: r.title, projectName: r.projectName, href: `/app/projects/${r.projectId}?tab=risks` });
  }
  return items;
}

/** The next active index for arrow-key movement, wrapping at both ends. */
export function moveSearchIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
