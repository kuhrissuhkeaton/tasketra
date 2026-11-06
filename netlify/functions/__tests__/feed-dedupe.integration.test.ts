import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import feedHandler from "../feed.mts";
import decisionsHandler from "../decisions.mts";

// v150: a newly created decision used to appear in the feed twice — once as
// the derived decision_request row and once as the activity_log
// decision/created row. The feed now drops the activity copy.
describe("feed decision de-duplication", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("shows a created decision once, not twice", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;

    const res = await decisionsHandler(asUser(owner, {
      method: "POST",
      url: "https://app.tasketra.com/api/decisions",
      body: { projectId, title: "Pick a date", context: "", options: ["Nov 20", "Nov 27"], stakeholderIds: [] },
    }));
    expect(res.status).toBe(201);

    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    expect(feedRes.status).toBe(200);
    const body = await jsonBody(feedRes);
    const aboutDecision = body.feed.filter((f: any) => f.title === "Pick a date");
    expect(aboutDecision).toHaveLength(1);
    expect(aboutDecision[0].type).toBe("decision_request");
  });

  it("still shows other activity entries (a decision deletion is not hidden)", async () => {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    const projectId = project.id as string;
    await db().sql`
      INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id)
      VALUES (${projectId}, 'decision', gen_random_uuid(), 'Old question', 'deleted', ${owner.id})
    `;
    const feedRes = await feedHandler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    const body = await jsonBody(feedRes);
    const item = body.feed.find((f: any) => f.type === "activity" && f.title === "Old question");
    expect(item).toBeTruthy();
  });
});
