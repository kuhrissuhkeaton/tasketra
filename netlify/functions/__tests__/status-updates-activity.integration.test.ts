import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import statusUpdatesHandler from "../status-updates.mts";
import myActivityHandler from "../my-activity.mts";
import feedHandler from "../feed.mts";

// v151 (Part C3): posting a check-in writes an activity_log row with the
// poster as actor, so the check-in shows up in the poster's My activity --
// while the project Feed keeps carrying it exactly once via its derived
// status_update branch.
describe("check-ins in My activity", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("appears once in the poster's My activity and once in the project feed", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const projectId = project.id;

    const res = await statusUpdatesHandler(asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/status-updates",
      body: { projectId, body: "Venue booked, catering next", health: "on_track" },
    }));
    expect(res.status).toBe(201);

    const mine = await jsonBody(await myActivityHandler(asUser(owner, { method: "GET", url: "https://app.tasketra.com/api/my-activity" })));
    const checkIns = mine.items.filter((i: any) => i.entityType === "status_update");
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].action).toBe("created");
    expect(checkIns[0].summary).toBe("Venue booked, catering next");
    expect(checkIns[0].projectId).toBe(projectId);

    const feed = await jsonBody(await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` })));
    const feedCheckIns = feed.feed.filter((f: any) => f.type === "status_update");
    expect(feedCheckIns).toHaveLength(1);
    expect(feed.feed.filter((f: any) => f.type === "activity")).toHaveLength(0);
  });

  it("does not appear in another member's My activity", async () => {
    const owner = await createTestUser("owner@example.com");
    const other = await createTestUser("other@example.com");
    const project = await createTestProject(owner.id);
    const projectId = project.id;

    const res = await statusUpdatesHandler(asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/status-updates",
      body: { projectId, body: "Owner's note" },
    }));
    expect(res.status).toBe(201);

    const theirs = await jsonBody(await myActivityHandler(asUser(other, { method: "GET", url: "https://app.tasketra.com/api/my-activity" })));
    expect(theirs.items.filter((i: any) => i.entityType === "status_update")).toHaveLength(0);
  });

  it("records a health-only check-in with its stated status as the summary", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);

    const res = await statusUpdatesHandler(asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/status-updates",
      body: { projectId: project.id, body: "", health: "at_risk" },
    }));
    expect(res.status).toBe(201);

    const mine = await jsonBody(await myActivityHandler(asUser(owner, { method: "GET", url: "https://app.tasketra.com/api/my-activity" })));
    const checkIns = mine.items.filter((i: any) => i.entityType === "status_update");
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].summary).toBe("At risk");
  });
});
