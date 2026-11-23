import { describe, it, expect } from "vitest";
import { featureMatches, flattenSearchResults, moveSearchIndex } from "../search";
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

describe("featureMatches (v174 pages & features index)", () => {
  it("resolves the features members could never find: snapshot, webhooks, connect your AI", () => {
    const snap = featureMatches("snapshot", { projectId: "p1", plan: "free" });
    expect(snap[0]).toMatchObject({ title: "Client Snapshot", href: "/app/projects/p1/print/snapshot", group: "Pages & features" });

    const hooks = featureMatches("webhooks", { projectId: "p1", plan: "free" });
    expect(hooks.map((i) => i.href)).toContain("/app/projects/p1?tab=connections");

    const ai = featureMatches("connect your AI", { projectId: null, plan: "free" });
    expect(ai.map((i) => i.title)).toContain("Account");
    expect(ai.find((i) => i.title === "Account")!.href).toBe("/app/account");
  });

  it("without a project context, project features point at the Projects list", () => {
    const snap = featureMatches("snapshot", { projectId: null, plan: "free" });
    expect(snap[0]).toMatchObject({ title: "Client Snapshot", href: "/app/projects", projectName: "Pick a project first" });
  });

  it("keeps the old labels working as aliases for one cycle (Comms Plan, Weekly Report, OKRs, RACI)", () => {
    const ctx = { projectId: "p1", plan: "free" };
    expect(featureMatches("comms plan", ctx).map((i) => i.href)).toContain("/app/projects/p1?tab=comms");
    expect(featureMatches("weekly report", ctx).map((i) => i.href)).toContain("/app/projects/p1?tab=report");
    expect(featureMatches("okrs", ctx).map((i) => i.href)).toContain("/app/projects/p1?tab=okrs");
    expect(featureMatches("raci", ctx).map((i) => i.href)).toContain("/app/projects/p1?tab=raci");
    expect(featureMatches("guides", ctx).map((i) => i.href)).toContain("/app/resources");
  });

  it("never offers Billing to founding members, and offers Founder hub only to them", () => {
    expect(featureMatches("billing", { projectId: null, plan: "founding" })).toEqual([]);
    expect(featureMatches("upgrade", { projectId: null, plan: "founding" })).toEqual([]);
    expect(featureMatches("billing", { projectId: null, plan: "free" }).map((i) => i.title)).toContain("Billing");
    expect(featureMatches("founder hub", { projectId: null, plan: "founding" }).map((i) => i.href)).toContain("/app/founding");
    expect(featureMatches("founder hub", { projectId: null, plan: "free" })).toEqual([]);
  });

  it("matches the plain destinations by name and stays quiet below two characters", () => {
    expect(featureMatches("workload", { plan: "free" })[0]).toMatchObject({ title: "Workload", href: "/app/workload" });
    expect(featureMatches("w", { plan: "free" })).toEqual([]);
    expect(featureMatches("zzzz", { plan: "free" })).toEqual([]);
  });

  it("caps the feature list so it cannot swamp content results", () => {
    expect(featureMatches("project", { projectId: "p1", plan: "free" }).length).toBeLessThanOrEqual(8);
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
