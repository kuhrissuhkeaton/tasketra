// Project navigation (v174 consolidation): the job-shaped group map, the
// old-link guarantee (every one of the 26 existing tab ids keeps its
// meaning), the unchanged size-hiding rules, and the "More sections"
// list that replaced the three old grow mechanisms.
import { describe, it, expect } from "vitest";
import { NAV_GROUPS, allNavTabIds, groupOf, sectionLabel, hiddenSections, visibleGroups, visibleSections, STRIP_TABS } from "../lib/projectNav";
import { hiddenTabIds } from "../lib/projectView";
// @ts-ignore node builtin: the app tsconfig has no node types, vitest runs in node
const read = async (p: string) => (await import("node:fs")).readFileSync(p, "utf8") as string;

const TAB_TYPE = async () => {
  const src = await read("src/pages/ProjectHome.tsx");
  const m = src.match(/export type Tab =([^;]+);/);
  return [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
};

describe("group map", () => {
  it("there are six groups, in order, named by the job", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Overview", "Plan", "Track", "People", "Wrap up", "Project settings"]);
  });

  it("every one of the 26 existing tab ids lands in exactly one group, so every old ?tab= link still works", async () => {
    const ids = await TAB_TYPE();
    expect(ids).toHaveLength(26);
    for (const id of ids) expect(groupOf(id), `${id} has no group`).not.toBeNull();
    const seen = NAV_GROUPS.flatMap((g) => g.sections.filter((s) => !s.href).map((s) => s.id));
    expect(new Set(seen).size).toBe(seen.length);
    expect(allNavTabIds().sort()).toEqual([...ids].sort());
  });

  it("maps each old id to its job-shaped group", () => {
    const expected: Record<string, string> = {
      home: "overview",
      roadmap: "plan", charter: "plan", budget: "plan", meetings: "plan", okrs: "plan",
      tasks: "track", issues: "track", risks: "track", assumptions: "track", dependencies: "track", quality: "track", compliance: "track",
      stakeholders: "people", decisions: "people", raci: "people", procurement: "people", comms: "people",
      documents: "wrapup", report: "wrapup", closure: "wrapup", templates: "wrapup", export: "wrapup", trash: "wrapup",
      team: "settings", connections: "settings",
    };
    for (const [tab, group] of Object.entries(expected)) expect(groupOf(tab), tab).toBe(group);
    expect(groupOf("nope")).toBeNull();
  });

  it("Client Snapshot is a link section in Wrap up, not a tab id", () => {
    expect(groupOf("snapshot")).toBe("wrapup");
    expect(sectionLabel("snapshot")).toBe("Client Snapshot");
    expect(allNavTabIds()).not.toContain("snapshot");
    const snap = NAV_GROUPS.find((g) => g.id === "wrapup")!.sections.find((s) => s.id === "snapshot")!;
    expect(snap.href!("p1")).toBe("/app/projects/p1/print/snapshot");
  });

  it("labels sections with the plain-word-first names", () => {
    expect(sectionLabel("procurement")).toBe("Vendors");
    expect(sectionLabel("comms")).toBe("Communication plan");
    expect(sectionLabel("okrs")).toBe("Goals (OKRs)");
    expect(sectionLabel("raci")).toBe("Roles (RACI)");
    expect(sectionLabel("report")).toBe("Status report");
    expect(sectionLabel("templates")).toBe("Saved templates");
    expect(sectionLabel("connections")).toBe("Webhooks");
    expect(sectionLabel("team")).toBe("Project settings");
    expect(sectionLabel("trash")).toBe("Trash");
    expect(sectionLabel("zzz")).toBeNull();
  });
});

describe("size hiding is unchanged", () => {
  it("Light hides the same sections as before, and its Track group keeps Tasks, Issues and Risks", () => {
    const track = NAV_GROUPS.find((g) => g.id === "track")!;
    expect(visibleSections(track, "issues", "light", false).map((s) => s.id)).toEqual(["tasks", "issues", "risks"]);
    for (const id of hiddenTabIds("light")) {
      const g = NAV_GROUPS.find((x) => x.sections.some((s) => s.id === id))!;
      expect(visibleSections(g, "home", "light", false).map((s) => s.id)).not.toContain(id);
    }
  });

  it("Standard hides Quality, Compliance and Comms; Full hides nothing", () => {
    const track = NAV_GROUPS.find((g) => g.id === "track")!;
    expect(visibleSections(track, "issues", "standard", false).map((s) => s.id)).not.toContain("quality");
    expect(visibleSections(track, "issues", "full", false)).toHaveLength(7);
  });

  it("show-all reveals everything, and the section being viewed is never hidden", () => {
    const plan = NAV_GROUPS.find((g) => g.id === "plan")!;
    expect(visibleSections(plan, "roadmap", "light", true)).toHaveLength(5);
    expect(visibleSections(plan, "budget", "light", false).map((s) => s.id)).toContain("budget");
  });

  it("every group stays visible on a Light project, and a click opens its first visible section", () => {
    const groups = visibleGroups("home", "light", false);
    expect(groups.map((g) => g.group.id)).toEqual(["overview", "plan", "track", "people", "wrapup", "settings"]);
    expect(groups.find((g) => g.group.id === "plan")!.opens).toBe("roadmap");
    expect(groups.find((g) => g.group.id === "people")!.opens).toBe("stakeholders");
    expect(groups.find((g) => g.group.id === "wrapup")!.opens).toBe("documents");
  });
});

describe("heading rule", () => {
  it("the old top-strip tabs keep the project name as the heading", () => {
    expect([...STRIP_TABS].sort()).toEqual(["budget", "home", "meetings", "roadmap", "tasks"]);
  });
});

describe("More sections (the hidden-by-size list)", () => {
  it("lists exactly the sections the size hides", () => {
    expect(hiddenSections("light", false).map((s) => s.id).sort()).toEqual([...hiddenTabIds("light")].sort());
    expect(hiddenSections("standard", false).map((s) => s.id).sort()).toEqual(
      ["quality", "compliance", "comms", "okrs", "raci", "templates"].sort(),
    );
    expect(hiddenSections("full", false)).toEqual([]);
  });

  it("comes back in nav order", () => {
    const order = NAV_GROUPS.flatMap((g) => g.sections.map((s) => s.id));
    const ids = hiddenSections("light", false).map((s) => s.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it("shrinks as sections are grown back, and empties under show-all", () => {
    const withBudget = hiddenSections("light", false, ["budget"]).map((s) => s.id);
    expect(withBudget).not.toContain("budget");
    expect(withBudget).toHaveLength(hiddenSections("light", false).length - 1);
    expect(hiddenSections("light", true)).toEqual([]);
  });

  it("never lists the Client Snapshot link section", () => {
    for (const size of ["light", "standard", "full"] as const) {
      expect(hiddenSections(size, false).map((s) => s.id)).not.toContain("snapshot");
    }
  });
});
