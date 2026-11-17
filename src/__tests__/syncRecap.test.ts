import { describe, it, expect } from "vitest";
import { buildRecap, buildSyncSections, projectStatusLine, statusHeadline } from "../lib/syncRecap";
import type { WeeklySyncAsk, WeeklySyncProject } from "../lib/api";

// v146: the Weekly sync page's words. The recap and the status lines may
// only claim what the /api/weekly-sync payload establishes; these tests pin
// the composition, the omitted-when-empty sections, and the honesty rules
// (no quiet claim without a known last sign of life, no counts for zero).

const TODAY = "2026-11-04";

const project = (over: Partial<WeeklySyncProject> = {}): WeeklySyncProject => ({
  id: "p1",
  name: "Alpha",
  health: "on_track",
  statedHealth: null,
  statedAt: null,
  lastActivityAt: null,
  overdueTasks: 0,
  openDecisions: 0,
  ...over,
});

describe("statusHeadline", () => {
  it("uses the computed health phrase when nobody has stated a status", () => {
    expect(statusHeadline(project({ health: "off_track" }))).toBe("Off track.");
    expect(statusHeadline(project({ health: "at_risk" }))).toBe("At risk.");
    expect(statusHeadline(project({ health: "on_track" }))).toBe("On track.");
  });

  it("uses the computed phrase when the stated status agrees with it", () => {
    expect(statusHeadline(project({ health: "at_risk", statedHealth: "at_risk", statedAt: "2026-11-01T09:00:00Z" }))).toBe("At risk.");
  });

  it("leads with the divergence when stated and computed disagree, in either direction", () => {
    expect(statusHeadline(project({ health: "at_risk", statedHealth: "on_track", statedAt: "2026-11-01T09:00:00Z" })))
      .toBe("Stated on track, evidence suggests at risk.");
    expect(statusHeadline(project({ health: "on_track", statedHealth: "off_track", statedAt: "2026-11-01T09:00:00Z" })))
      .toBe("Stated off track, evidence suggests on track.");
  });
});

describe("projectStatusLine", () => {
  it("appends past-due and waiting counts, singular and plural, and omits zeroes", () => {
    expect(projectStatusLine(project({ overdueTasks: 2, openDecisions: 1 }), TODAY))
      .toBe("On track. 2 tasks past due. 1 decision waiting.");
    expect(projectStatusLine(project({ overdueTasks: 1, openDecisions: 3 }), TODAY))
      .toBe("On track. 1 task past due. 3 decisions waiting.");
    expect(projectStatusLine(project({}), TODAY)).toBe("On track.");
  });

  it("claims quiet only from a known last sign of life at least a week old", () => {
    expect(projectStatusLine(project({ lastActivityAt: "2026-10-15T10:00:00Z" }), TODAY))
      .toBe("On track. No update in 20 days.");
    expect(projectStatusLine(project({ lastActivityAt: "2026-11-02T10:00:00Z" }), TODAY))
      .toBe("On track.");
    // Neither timestamp known: no claim at all.
    expect(projectStatusLine(project({}), TODAY)).toBe("On track.");
  });

  it("treats a recent stated status as a sign of life even when activity is older", () => {
    expect(projectStatusLine(project({
      health: "at_risk",
      statedHealth: "at_risk",
      statedAt: "2026-11-03T10:00:00Z",
      lastActivityAt: "2026-10-01T10:00:00Z",
    }), TODAY)).toBe("At risk.");
    // And an old stated status does not hide old activity: the newer of the
    // two is what counts (here activity, 20 days).
    expect(projectStatusLine(project({
      health: "at_risk",
      statedHealth: "at_risk",
      statedAt: "2026-09-01T10:00:00Z",
      lastActivityAt: "2026-10-15T10:00:00Z",
    }), TODAY)).toBe("At risk. No update in 20 days.");
  });
});

describe("buildRecap", () => {
  it("renders just a header and the empty line when there is nothing to sync", () => {
    expect(buildRecap({ projects: [], asks: [] }, TODAY)).toBe(
      "Weekly sync — November 4, 2026\nNo active projects.",
    );
  });

  it("counts projects by health, naming only the groups that occur", () => {
    const recap = buildRecap({
      projects: [
        project({ name: "A", health: "on_track" }),
        project({ name: "B", health: "on_track" }),
        project({ name: "C", health: "off_track" }),
      ],
      asks: [],
    }, TODAY);
    expect(recap).toContain("3 projects: 2 on track, 1 off track.");
    expect(recap).not.toContain("at risk");
  });

  it("uses the singular for one project and phrases its line with the headline only", () => {
    const recap = buildRecap({
      projects: [project({ name: "Solo", health: "at_risk", overdueTasks: 5 })],
      asks: [],
    }, TODAY);
    expect(recap).toContain("1 project: 1 at risk.");
    // The recap line is name + shortest phrase; the counts live on the page.
    expect(recap).toContain("- Solo: At risk.");
    expect(recap).not.toContain("5 tasks past due");
  });

  it("omits the asks section entirely when no asks are waiting", () => {
    const recap = buildRecap({ projects: [project({})], asks: [] }, TODAY);
    expect(recap).not.toContain("Asks waiting:");
  });

  it("ends with the Clean sweep line when projects exist and nobody is waiting (Egg 2)", () => {
    const recap = buildRecap({ projects: [project({})], asks: [] }, TODAY);
    expect(recap.endsWith("\n\nClean sweep: nobody is waiting on anybody.")).toBe(true);
  });

  it("no Clean sweep line when asks are waiting or there are no projects", () => {
    const withAsks = buildRecap({
      projects: [project({})],
      asks: [{ id: "a1", projectId: "p1", projectName: "Alpha", title: "Pick a vendor", context: null, deadline: null, createdAt: "2026-10-29T09:00:00Z", recipients: [] }],
    }, TODAY);
    expect(withAsks).not.toContain("Clean sweep");
    expect(buildRecap({ projects: [], asks: [] }, TODAY)).not.toContain("Clean sweep");
  });

  it("lists asks with their project and needed-by date, or 'no date set'", () => {
    const recap = buildRecap({
      projects: [project({ name: "Beta", health: "at_risk", statedHealth: "on_track", statedAt: "2026-11-01T09:00:00Z" })],
      asks: [
        { id: "a1", projectId: "p1", projectName: "Beta", title: "Pick a vendor", context: null, deadline: "2026-11-12", createdAt: "2026-10-29T09:00:00Z", recipients: ["Amy Approver"] },
        { id: "a2", projectId: "p1", projectName: "Beta", title: "Hire a designer", context: null, deadline: null, createdAt: "2026-10-30T09:00:00Z", recipients: [] },
      ],
    }, TODAY);
    expect(recap).toBe([
      "Weekly sync — November 4, 2026",
      // v156: the count line groups by headline health -- Beta stated
      // on track, so it counts as on track even though the evidence
      // computes at risk (the per-project line still shows both halves).
      "1 project: 1 on track.",
      "",
      "- Beta: Stated on track, evidence suggests at risk.",
      "",
      "Asks waiting:",
      "- Pick a vendor (Beta) — needed by Nov 12, 2026",
      "- Hire a designer (Beta) — no date set",
    ].join("\n"));
  });

  it("emits the edited narrative sections between the project lines and the asks (v160, F-23)", () => {
    const recap = buildRecap({
      projects: [project({ name: "Beta", health: "on_track" })],
      asks: [
        { id: "a1", projectId: "p1", projectName: "Beta", title: "Pick a vendor", context: null, deadline: null, createdAt: "2026-10-29T09:00:00Z", recipients: [] },
      ],
    }, TODAY, { wins: "Beta is on track\nShipped the beta", blockers: "", nextWeek: "Kick off onboarding" });
    expect(recap).toBe([
      "Weekly sync — November 4, 2026",
      "1 project: 1 on track.",
      "",
      "- Beta: On track.",
      "",
      "Wins:",
      "- Beta is on track",
      "- Shipped the beta",
      "",
      "Next week:",
      "- Kick off onboarding",
      "",
      "Asks waiting:",
      "- Pick a vendor (Beta) — no date set",
    ].join("\n"));
  });

  it("omits narrative sections that are empty or whitespace, and all of them when there are no projects", () => {
    const recap = buildRecap({ projects: [project({})], asks: [] }, TODAY, { wins: "  \n", blockers: "", nextWeek: "" });
    expect(recap).not.toContain("Wins:");
    expect(recap).not.toContain("Blockers:");
    expect(recap).not.toContain("Next week:");
    const empty = buildRecap({ projects: [], asks: [] }, TODAY, { wins: "A win", blockers: "", nextWeek: "" });
    expect(empty).not.toContain("Wins:");
  });

  it("counts a stated status as the headline in the group counts (v156)", () => {
    const recap = buildRecap({
      projects: [
        project({ name: "A", health: "off_track", statedHealth: "on_track", statedAt: "2026-11-01T09:00:00Z" }),
        project({ name: "B", health: "on_track", statedHealth: "off_track", statedAt: "2026-11-01T09:00:00Z" }),
        project({ name: "C", health: "at_risk" }),
      ],
      asks: [],
    }, TODAY);
    expect(recap).toContain("3 projects: 1 on track, 1 at risk, 1 off track.");
  });
});

describe("buildSyncSections (v160, F-23)", () => {
  const ask = (over: Partial<WeeklySyncAsk> = {}): WeeklySyncAsk => ({
    id: "a1", projectId: "p1", projectName: "Alpha", title: "Pick a vendor",
    context: null, deadline: null, createdAt: "2026-10-29T09:00:00Z", recipients: [],
    ...over,
  });

  it("wins are the projects on their headline, stated included", () => {
    const s = buildSyncSections({
      projects: [
        project({ name: "A", health: "on_track" }),
        project({ name: "B", health: "at_risk", statedHealth: "on_track", statedAt: "2026-11-01T09:00:00Z" }),
        project({ name: "C", health: "off_track" }),
      ],
      asks: [],
    }, TODAY);
    expect(s.wins).toBe("A is on track\nB is on track");
  });

  it("blockers combine a project's headline and its past-due count on one line", () => {
    const s = buildSyncSections({
      projects: [
        project({ name: "A", health: "at_risk", overdueTasks: 2 }),
        project({ name: "B", health: "on_track", overdueTasks: 1 }),
        project({ name: "C", health: "on_track" }),
      ],
      asks: [],
    }, TODAY);
    expect(s.blockers).toBe("A: at risk · 2 tasks past due\nB: 1 task past due");
  });

  it("next week takes asks due within seven days, earliest first, and skips past or undated ones", () => {
    const s = buildSyncSections({
      projects: [project({})],
      asks: [
        ask({ id: "a1", title: "Later", deadline: "2026-11-09" }),
        ask({ id: "a2", title: "Sooner", deadline: "2026-11-06" }),
        ask({ id: "a3", title: "Too far out", deadline: "2026-11-20" }),
        ask({ id: "a4", title: "Already past", deadline: "2026-11-02" }),
        ask({ id: "a5", title: "Undated", deadline: null }),
      ],
    }, TODAY);
    expect(s.nextWeek).toBe(
      "Sooner (Alpha) — needed by Nov 6, 2026\nLater (Alpha) — needed by Nov 9, 2026",
    );
  });

  it("next week asks for a check-in on a project quiet for a week or more, and only then", () => {
    const s = buildSyncSections({
      projects: [
        project({ name: "Quiet", lastActivityAt: "2026-10-15T10:00:00Z" }),
        project({ name: "Fresh", lastActivityAt: "2026-11-02T10:00:00Z" }),
        project({ name: "Unknown" }),
      ],
      asks: [],
    }, TODAY);
    expect(s.nextWeek).toBe("Post a check-in on Quiet (no update in 20 days)");
  });

  it("an empty payload pre-fills nothing", () => {
    expect(buildSyncSections({ projects: [], asks: [] }, TODAY)).toEqual({ wins: "", blockers: "", nextWeek: "" });
  });
});
