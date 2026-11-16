import { describe, it, expect } from "vitest";
import { flattenSearchResults, moveSearchIndex } from "../search";
import type { SearchResults } from "../api";

// v159 (F-18): the palette's list plumbing -- grouping order, link targets
// and keyboard movement are pure and pinned here.

const results = (over: Partial<SearchResults> = {}): SearchResults => ({
  projects: [{ id: "p1", name: "Portal Launch" }],
  tasks: [{ id: "t1", title: "Wire the SSO flow", projectId: "p1", projectName: "Portal Launch" }],
  decisions: [{ id: "d1", title: "Pick the vendor", projectId: "p1", projectName: "Portal Launch" }],
  risks: [{ id: "r1", title: "SSO approval slips", projectId: "p1", projectName: "Portal Launch" }],
  ...over,
});

describe("flattenSearchResults", () => {
  it("flattens in group order: projects, tasks, decisions, risks", () => {
    const items = flattenSearchResults(results());
    expect(items.map((i) => i.group)).toEqual(["Projects", "Tasks", "Decisions", "Risks"]);
    expect(items.map((i) => i.title)).toEqual(["Portal Launch", "Wire the SSO flow", "Pick the vendor", "SSO approval slips"]);
  });

  it("links projects to their page and items to the tab where they live", () => {
    const items = flattenSearchResults(results());
    expect(items[0].href).toBe("/app/projects/p1");
    expect(items[1].href).toBe("/app/projects/p1?tab=tasks");
    expect(items[2].href).toBe("/app/projects/p1?tab=decisions");
    expect(items[3].href).toBe("/app/projects/p1?tab=risks");
  });

  it("carries the project name on non-project hits and skips empty groups", () => {
    const items = flattenSearchResults(results({ projects: [], decisions: [], risks: [] }));
    expect(items).toHaveLength(1);
    expect(items[0].projectName).toBe("Portal Launch");
  });

  it("returns nothing for an empty payload", () => {
    expect(flattenSearchResults({ projects: [], tasks: [], decisions: [], risks: [] })).toEqual([]);
  });
});

describe("moveSearchIndex", () => {
  it("moves down and up, wrapping at both ends", () => {
    expect(moveSearchIndex(0, 1, 3)).toBe(1);
    expect(moveSearchIndex(2, 1, 3)).toBe(0);
    expect(moveSearchIndex(0, -1, 3)).toBe(2);
  });

  it("starts at an end from no selection, and stays unset with no items", () => {
    expect(moveSearchIndex(-1, 1, 3)).toBe(0);
    expect(moveSearchIndex(-1, -1, 3)).toBe(2);
    expect(moveSearchIndex(-1, 1, 0)).toBe(-1);
  });
});
