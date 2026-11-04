import { describe, it, expect } from "vitest";
import { buildRecap, projectStatusLine, statusHeadline } from "../lib/syncRecap";
import type { WeeklySyncProject } from "../lib/api";

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
      "1 project: 1 at risk.",
      "",
      "- Beta: Stated on track, evidence suggests at risk.",
      "",
      "Asks waiting:",
      "- Pick a vendor (Beta) — needed by Nov 12, 2026",
      "- Hire a designer (Beta) — no date set",
    ].join("\n"));
  });
});
