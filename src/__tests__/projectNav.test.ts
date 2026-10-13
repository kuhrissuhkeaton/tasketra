// Six-tab project navigation (redesign batch 2): the group map, the old-link guarantee,
// and the unchanged size-hiding rules.
import { describe, it, expect } from "vitest";
import { NAV_GROUPS, allNavTabIds, groupOf, sectionLabel, visibleGroups, visibleSections, STRIP_TABS } from "../lib/projectNav";
import { hiddenTabIds } from "../lib/projectView";
// @ts-ignore node builtin: the app tsconfig has no node types, vitest runs in node
const read = async (p: string) => (await import("node:fs")).readFileSync(p, "utf8") as string;

const TAB_TYPE = async () => {
  const src = await read("src/pages/ProjectHome.tsx");
  const m = src.match(/export type Tab =([^;]+);/);
  return [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
};

describe("group map", () => {
  it("there are six groups, in order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Overview", "Tasks", "Plan", "Health", "People and decisions", "Docs"]);
  });

  it("every one of the 26 existing tab ids lands in exactly one group, so every old ?tab= link still works", async () => {
    const ids = await TAB_TYPE();
    expect(ids).toHaveLength(26);
    for (const id of ids) expect(groupOf(id), `${id} has no group`).not.toBeNull();
    const seen = NAV_GROUPS.flatMap((g) => g.sections.map((s) => s.id));
    expect(new Set(seen).size).toBe(seen.length);
    expect(allNavTabIds().sort()).toEqual([...ids].sort());
  });

  it("maps each old id to the group the Look Book promised", () => {
    const expected: Record<string, string> = {
      home: "overview", tasks: "tasks",
      roadmap: "plan", budget: "plan", meetings: "plan", charter: "plan", okrs: "plan",
      issues: "health", risks: "health", assumptions: "health", dependencies: "health", quality: "health", compliance: "health",
      decisions: "people", stakeholders: "people", team: "people", raci: "people", procurement: "people", comms: "people",
      documents: "docs", report: "docs", closure: "docs", templates: "docs", export: "docs", connections: "docs", trash: "docs",
    };
    for (const [tab, group] of Object.entries(expected)) expect(groupOf(tab), tab).toBe(group);
    expect(groupOf("nope")).toBeNull();
  });

  it("labels sections the way the old nav did", () => {
    expect(sectionLabel("procurement")).toBe("Vendors");
    expect(sectionLabel("comms")).toBe("Comms plan");
    expect(sectionLabel("trash")).toBe("Trash");
    expect(sectionLabel("zzz")).toBeNull();
  });
});

describe("size hiding is unchanged", () => {
  it("Light hides the same sections as before, and its Health group keeps just Issues and Risks", () => {
    const health = NAV_GROUPS.find((g) => g.id === "health")!;
    expect(visibleSections(health, "issues", "light", false).map((s) => s.id)).toEqual(["issues", "risks"]);
    for (const id of hiddenTabIds("light")) {
      const g = NAV_GROUPS.find((x) => x.sections.some((s) => s.id === id))!;
      expect(visibleSections(g, "home", "light", false).map((s) => s.id)).not.toContain(id);
    }
  });

  it("Standard hides Quality, Compliance and Comms; Full hides nothing", () => {
    const health = NAV_GROUPS.find((g) => g.id === "health")!;
    expect(visibleSections(health, "issues", "standard", false).map((s) => s.id)).not.toContain("quality");
    expect(visibleSections(health, "issues", "full", false)).toHaveLength(6);
  });

  it("show-all reveals everything, and the section being viewed is never hidden", () => {
    const plan = NAV_GROUPS.find((g) => g.id === "plan")!;
    expect(visibleSections(plan, "roadmap", "light", true)).toHaveLength(5);
    expect(visibleSections(plan, "budget", "light", false).map((s) => s.id)).toContain("budget");
  });

  it("every group stays visible on a Light project, and a click opens its first visible section", () => {
    const groups = visibleGroups("home", "light", false);
    expect(groups.map((g) => g.group.id)).toEqual(["overview", "tasks", "plan", "health", "people", "docs"]);
    expect(groups.find((g) => g.group.id === "plan")!.opens).toBe("roadmap");
    expect(groups.find((g) => g.group.id === "people")!.opens).toBe("decisions");
  });
});

describe("heading rule", () => {
  it("the old top-strip tabs keep the project name as the heading", () => {
    expect([...STRIP_TABS].sort()).toEqual(["budget", "home", "meetings", "roadmap", "tasks"]);
  });
});
