import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import statusUpdatesHandler from "../status-updates.mts";
import feedHandler from "../feed.mts";
import portfolioHandler from "../portfolio.mts";
import weeklyReportHandler from "../weekly-report.mts";

// v143: a status update can carry a stated health (on_track / at_risk /
// off_track). These tests cover the write path (validation + persistence),
// and every read surface that picks the value up: the feed, the portfolio
// summary's statedHealth/statedAt, and the weekly report's note prefix.

const post = (user: { cookie: string }, body: unknown) =>
  statusUpdatesHandler(asUser(user, { method: "POST", url: "https://tasketra.com/api/status-updates", body }));

async function insertUpdate(projectId: string, opts: { body?: string; health?: string | null; createdAt: string }) {
  const database = db();
  await database.sql`
    INSERT INTO status_updates (project_id, body, health, created_at)
    VALUES (${projectId}, ${opts.body ?? "seed note"}, ${opts.health ?? null}, ${opts.createdAt})
  `;
}

describe("status updates with a stated health (v143)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("persists a valid health and returns it", async () => {
    const user = await createTestUser("su-ok@example.com");
    const project = await createTestProject(user.id);
    const res = await post(user, { projectId: project.id, body: "Slipping a bit", health: "at_risk" });
    expect(res.status).toBe(201);
    const { statusUpdate } = await jsonBody<any>(res);
    expect(statusUpdate.health).toBe("at_risk");
    expect(statusUpdate.body).toBe("Slipping a bit");

    const database = db();
    const rows = await database.sql`SELECT health FROM status_updates WHERE project_id = ${project.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].health).toBe("at_risk");
  });

  it("accepts a bare check-in: empty body with a health", async () => {
    const user = await createTestUser("su-bare@example.com");
    const project = await createTestProject(user.id);
    const res = await post(user, { projectId: project.id, body: "", health: "on_track" });
    expect(res.status).toBe(201);
    const { statusUpdate } = await jsonBody<any>(res);
    expect(statusUpdate.health).toBe("on_track");
    expect(statusUpdate.body).toBe("");
  });

  it("still accepts a plain note with no health, stored as NULL", async () => {
    const user = await createTestUser("su-plain@example.com");
    const project = await createTestProject(user.id);
    const res = await post(user, { projectId: project.id, body: "Just a note" });
    expect(res.status).toBe(201);
    const { statusUpdate } = await jsonBody<any>(res);
    expect(statusUpdate.health).toBeNull();
  });

  it("rejects an invalid health with a 400 and writes nothing", async () => {
    const user = await createTestUser("su-bad@example.com");
    const project = await createTestProject(user.id);
    const res = await post(user, { projectId: project.id, body: "Note", health: "mostly_fine" });
    expect(res.status).toBe(400);
    const database = db();
    const rows = await database.sql`SELECT id FROM status_updates WHERE project_id = ${project.id}`;
    expect(rows).toHaveLength(0);
  });

  it("rejects an empty body with no health, as before", async () => {
    const user = await createTestUser("su-empty@example.com");
    const project = await createTestProject(user.id);
    expect((await post(user, { projectId: project.id, body: "" })).status).toBe(400);
    expect((await post(user, { projectId: project.id, body: "   " })).status).toBe(400);
    expect((await post(user, { projectId: project.id })).status).toBe(400);
  });

  it("keeps the auth and access checks: 401 anonymous, 404 for a stranger's project", async () => {
    const anon = await statusUpdatesHandler(
      new Request("https://tasketra.com/api/status-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "x", body: "hi", health: "on_track" }),
      })
    );
    expect(anon.status).toBe(401);

    const owner = await createTestUser("su-owner@example.com");
    const stranger = await createTestUser("su-stranger@example.com");
    const project = await createTestProject(owner.id);
    expect((await post(stranger, { projectId: project.id, body: "hi", health: "on_track" })).status).toBe(404);
  });

  it("includes the health on status-update feed items, null on plain notes", async () => {
    const user = await createTestUser("su-feed@example.com");
    const project = await createTestProject(user.id);
    await post(user, { projectId: project.id, body: "With status", health: "off_track" });
    await post(user, { projectId: project.id, body: "Plain note" });

    const res = await feedHandler(asUser(user, { method: "GET", url: `https://tasketra.com/api/feed?projectId=${project.id}` }));
    expect(res.status).toBe(200);
    const { feed } = await jsonBody<any>(res);
    const updates = feed.filter((i: any) => i.type === "status_update");
    expect(updates).toHaveLength(2);
    expect(updates.find((i: any) => i.body === "With status").health).toBe("off_track");
    expect(updates.find((i: any) => i.body === "Plain note").health).toBeNull();
  });

  it("portfolio statedHealth/statedAt come from the LATEST update that has a health", async () => {
    const user = await createTestUser("su-portfolio@example.com");
    const project = await createTestProject(user.id);
    await insertUpdate(project.id, { body: "First read", health: "on_track", createdAt: "2026-10-20T09:00:00Z" });
    await insertUpdate(project.id, { body: "Second read", health: "off_track", createdAt: "2026-10-27T09:00:00Z" });
    // A later PLAIN note must not clear or replace the stated status.
    await insertUpdate(project.id, { body: "Later plain note", health: null, createdAt: "2026-11-02T09:00:00Z" });

    const res = await portfolioHandler(asUser(user, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    const data = await jsonBody<any>(res);
    const summary = data.projects.find((p: any) => p.id === project.id);
    expect(summary.statedHealth).toBe("off_track");
    expect(new Date(summary.statedAt).toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });

  it("portfolio statedHealth/statedAt are null when nobody has stated one", async () => {
    const user = await createTestUser("su-nostate@example.com");
    const project = await createTestProject(user.id);
    await insertUpdate(project.id, { body: "Only plain notes", health: null, createdAt: "2026-11-02T09:00:00Z" });

    const res = await portfolioHandler(asUser(user, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    const data = await jsonBody<any>(res);
    const summary = data.projects.find((p: any) => p.id === project.id);
    expect(summary.statedHealth).toBeNull();
    expect(summary.statedAt).toBeNull();
  });

  it("weekly report prefixes the stated status label and leaves plain notes alone", async () => {
    const user = await createTestUser("su-report@example.com");
    const project = await createTestProject(user.id);
    const now = new Date().toISOString();
    await insertUpdate(project.id, { body: "Vendor slipped a week", health: "at_risk", createdAt: now });
    await insertUpdate(project.id, { body: "Standup moved to 9:30", health: null, createdAt: now });
    await insertUpdate(project.id, { body: "", health: "off_track", createdAt: now });

    const res = await weeklyReportHandler(
      asUser(user, { method: "GET", url: `https://tasketra.com/api/weekly-report?projectId=${project.id}` })
    );
    expect(res.status).toBe(200);
    const data = await jsonBody<any>(res);
    const bodies = data.statusUpdates.map((s: any) => s.body);
    expect(bodies).toContain("At risk — Vendor slipped a week");
    expect(bodies).toContain("Standup moved to 9:30");
    expect(bodies).toContain("Off track");
    expect(data.statusUpdates.find((s: any) => s.body.startsWith("At risk")).health).toBe("at_risk");
  });
});
