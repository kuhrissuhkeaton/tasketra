import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import portfolioHandler from "../portfolio.mts";
import objectivesHandler from "../objectives.mts";
import keyResultsHandler from "../key-results.mts";

// Direct inserts for the entities the portfolio rollup reads that fixtures.ts
// doesn't already cover (tasks, risks, issues, roadmap milestones) -- these
// mirror each entity's own migration schema and are only used to seed
// aggregate math, not to exercise their own handlers (those already have
// their own integration tests).

async function insertTask(projectId: string, opts: { status?: string; dueDate?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO tasks (project_id, title, status, due_date)
    VALUES (${projectId}, 'Seed task', ${opts.status ?? "not_started"}, ${opts.dueDate ?? null})
  `;
}

async function insertRisk(projectId: string, opts: { probability?: string; impact?: string; status?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO risks (project_id, title, probability, impact, status)
    VALUES (${projectId}, 'Seed risk', ${opts.probability ?? "medium"}, ${opts.impact ?? "medium"}, ${opts.status ?? "open"})
  `;
}

async function insertIssue(projectId: string, opts: { severity?: string; status?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO issues (project_id, title, severity, status)
    VALUES (${projectId}, 'Seed issue', ${opts.severity ?? "medium"}, ${opts.status ?? "open"})
  `;
}

async function insertMilestone(projectId: string, startDate: string, opts: { status?: string } = {}) {
  const database = db();
  await database.sql`
    INSERT INTO roadmap_items (project_id, type, title, start_date, status)
    VALUES (${projectId}, 'milestone', 'Seed milestone', ${startDate}, ${opts.status ?? "not_started"})
  `;
}

async function addObjective(owner: { cookie: string }, projectId: string, status: string, keyResults: Array<{ start: number; current: number; target: number }>) {
  const create = await objectivesHandler(
    asUser(owner, { method: "POST", url: "https://tasketra.com/api/objectives", body: { projectId, title: "Seed objective", status } })
  );
  const { objective } = await jsonBody<{ objective: any }>(create);
  for (const kr of keyResults) {
    await keyResultsHandler(
      asUser(owner, {
        method: "POST", url: "https://tasketra.com/api/key-results",
        body: { objectiveId: objective.id, title: "Seed KR", startValue: kr.start, currentValue: kr.current, targetValue: kr.target },
      })
    );
  }
  return objective;
}

describe("portfolio", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns an empty rollup for a user with no projects", async () => {
    const owner = await createTestUser("pf-empty@example.com");
    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);
    expect(data.kpis.activeProjects).toBe(0);
    expect(data.kpis.avgObjectiveProgress).toBeNull();
    expect(data.projects).toEqual([]);
    expect(data.taskStatusBreakdown).toEqual([]);
    expect(data.upcomingMilestones).toEqual([]);
  });

  it("aggregates task status, risk/issue counts and health across the user's own projects, and excludes projects the user can't see", async () => {
    const owner = await createTestUser("pf-owner@example.com");
    const outsider = await createTestUser("pf-outsider@example.com");

    const healthy = await createTestProject(owner.id, "Healthy Project");
    await insertTask(healthy.id, { status: "done" });
    await insertTask(healthy.id, { status: "done" });
    await addObjective(owner, healthy.id, "on_track", [{ start: 0, current: 100, target: 100 }]);

    const struggling = await createTestProject(owner.id, "Struggling Project");
    await insertTask(struggling.id, { status: "not_started", dueDate: "2020-01-01" }); // overdue
    await insertRisk(struggling.id, { probability: "high", impact: "high" });
    await insertIssue(struggling.id, { severity: "critical" });
    await addObjective(owner, struggling.id, "off_track", [{ start: 0, current: 10, target: 100 }]);

    const notMine = await createTestProject(outsider.id, "Not Mine");
    await insertTask(notMine.id, { status: "not_started", dueDate: "2020-01-01" });
    await insertRisk(notMine.id, { probability: "high", impact: "high" });

    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);

    expect(data.kpis.activeProjects).toBe(2);
    expect(data.projects.map((p: any) => p.name).sort()).toEqual(["Healthy Project", "Struggling Project"]);

    const healthyRow = data.projects.find((p: any) => p.name === "Healthy Project");
    expect(healthyRow.doneTasks).toBe(2);
    expect(healthyRow.overdueTasks).toBe(0);
    expect(healthyRow.openRisks).toBe(0);
    expect(healthyRow.health).toBe("on_track");
    expect(healthyRow.avgObjectiveProgress).toBe(100);

    const strugglingRow = data.projects.find((p: any) => p.name === "Struggling Project");
    expect(strugglingRow.overdueTasks).toBe(1);
    expect(strugglingRow.highRisks).toBe(1);
    expect(strugglingRow.highIssues).toBe(1);
    expect(strugglingRow.health).toBe("off_track"); // a high issue alone forces off_track
    expect(strugglingRow.avgObjectiveProgress).toBe(10);

    expect(data.kpis.overdueTasks).toBe(1);
    expect(data.kpis.openRisks).toBe(1);
    expect(data.kpis.highIssues).toBe(1);
    expect(data.kpis.totalObjectives).toBe(2);
    expect(data.kpis.objectivesOffTrack).toBe(1);
    expect(data.kpis.objectivesOnTrack).toBe(1);
    expect(data.kpis.offTrackProjects).toBe(1);

    const doneEntry = data.taskStatusBreakdown.find((s: any) => s.status === "done");
    const notStartedEntry = data.taskStatusBreakdown.find((s: any) => s.status === "not_started");
    expect(doneEntry.count).toBe(2);
    expect(notStartedEntry.count).toBe(1); // the outsider's task must not be counted
  });

  it("marks at_risk before off_track when only mild signals are present", async () => {
    const owner = await createTestUser("pf-watch@example.com");
    const watch = await createTestProject(owner.id, "Watch Project");
    await insertTask(watch.id, { status: "not_started", dueDate: "2020-01-01" }); // one overdue task, nothing else wrong

    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    const data = await jsonBody<any>(res);
    const row = data.projects.find((p: any) => p.name === "Watch Project");
    expect(row.health).toBe("at_risk");
  });

  it("returns upcoming, non-done milestones across projects in date order, capped at 5, excluding inaccessible projects", async () => {
    const owner = await createTestUser("pf-milestones@example.com");
    const outsider = await createTestUser("pf-milestones-outsider@example.com");

    const a = await createTestProject(owner.id, "Project A");
    const b = await createTestProject(owner.id, "Project B");
    const notMine = await createTestProject(outsider.id, "Not Mine Either");

    await insertMilestone(a.id, "2027-03-01");
    await insertMilestone(b.id, "2027-01-01");
    await insertMilestone(a.id, "2027-02-01");
    await insertMilestone(b.id, "2027-04-01");
    await insertMilestone(a.id, "2027-05-01");
    await insertMilestone(b.id, "2027-06-01"); // 6th -- should be cut off by the LIMIT 5
    await insertMilestone(a.id, "2026-01-01", { status: "done" }); // done -- excluded regardless of date
    await insertMilestone(notMine.id, "2026-06-01"); // inaccessible -- excluded

    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    const data = await jsonBody<any>(res);

    expect(data.upcomingMilestones).toHaveLength(5);
    const dates = data.upcomingMilestones.map((m: any) => String(m.date).slice(0, 10));
    expect(dates).toEqual(["2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01"]);
    expect(data.upcomingMilestones.every((m: any) => m.projectName === "Project A" || m.projectName === "Project B")).toBe(true);
  });

  it("breaks open issues down by severity, excluding resolved issues and inaccessible projects", async () => {
    const owner = await createTestUser("pf-severity@example.com");
    const outsider = await createTestUser("pf-severity-outsider@example.com");

    const mine = await createTestProject(owner.id, "Severity Project");
    await insertIssue(mine.id, { severity: "low" });
    await insertIssue(mine.id, { severity: "low" });
    await insertIssue(mine.id, { severity: "high" });
    await insertIssue(mine.id, { severity: "critical" });
    await insertIssue(mine.id, { severity: "medium", status: "resolved" }); // resolved -- must not count as open

    const notMine = await createTestProject(outsider.id, "Not Mine");
    await insertIssue(notMine.id, { severity: "critical" });

    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);

    const bySeverity = Object.fromEntries(data.issueSeverityBreakdown.map((s: any) => [s.severity, s.count]));
    expect(bySeverity.low).toBe(2);
    expect(bySeverity.high).toBe(1);
    expect(bySeverity.critical).toBe(1); // the outsider's critical issue must not be counted
    expect(bySeverity.medium).toBeUndefined(); // the resolved issue must not appear at all
  });

  it("scopes every aggregate to a single project when ?projectId= is given, and checks access first", async () => {
    const owner = await createTestUser("pf-filter@example.com");
    const outsider = await createTestUser("pf-filter-outsider@example.com");

    const a = await createTestProject(owner.id, "Filter Project A");
    await insertTask(a.id, { status: "done" });
    await insertIssue(a.id, { severity: "critical" });

    const b = await createTestProject(owner.id, "Filter Project B");
    await insertTask(b.id, { status: "not_started" });
    await insertIssue(b.id, { severity: "low" });

    const notMine = await createTestProject(outsider.id, "Not Mine");

    const filtered = await portfolioHandler(
      asUser(owner, { method: "GET", url: `https://tasketra.com/api/portfolio?projectId=${a.id}` })
    );
    expect(filtered.status).toBe(200);
    const data = await jsonBody<any>(filtered);

    expect(data.kpis.activeProjects).toBe(1);
    expect(data.projects.map((p: any) => p.name)).toEqual(["Filter Project A"]);
    const bySeverity = Object.fromEntries(data.issueSeverityBreakdown.map((s: any) => [s.severity, s.count]));
    expect(bySeverity.critical).toBe(1);
    expect(bySeverity.low).toBeUndefined(); // Project B's issue must not leak in

    const forbidden = await portfolioHandler(
      asUser(owner, { method: "GET", url: `https://tasketra.com/api/portfolio?projectId=${notMine.id}` })
    );
    expect(forbidden.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await portfolioHandler(new Request("https://tasketra.com/api/portfolio", { method: "GET" }));
    expect(res.status).toBe(401);
  });
});
