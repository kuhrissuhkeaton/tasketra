import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../feed.mts";

async function addEntry(projectId: string, actorId: string | null, title: string) {
  await db().sql`
    INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id)
    VALUES (${projectId}, 'task', gen_random_uuid(), ${title}, 'created', ${actorId})
  `;
}

describe("feed shows who did it", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  async function setup() {
    const owner = await createTestUser("owner@example.com");
    await createTestProject(owner.id);
    const [project] = await db().sql`SELECT id FROM projects LIMIT 1`;
    return { owner, projectId: project.id as string };
  }

  async function activityMeta(owner: Awaited<ReturnType<typeof createTestUser>>, projectId: string, title: string) {
    const res = await handler(asUser(owner, { method: "GET", url: `https://app.tasketra.com/api/feed?projectId=${projectId}` }));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    const item = body.feed.find((f: any) => f.type === "activity" && f.title === title);
    expect(item).toBeTruthy();
    return { meta: item.meta, raw: JSON.stringify(body) };
  }

  it("names the person who made the change", async () => {
    const { owner, projectId } = await setup();
    await db().sql`UPDATE users SET display_name = 'Maya' WHERE id = ${owner.id}`;
    await addEntry(projectId, owner.id, "Draft charter");
    const { meta } = await activityMeta(owner, projectId, "Draft charter");
    expect(meta.actorName).toBe("Maya");
  });

  it("says 'a teammate' when they have no display name, and never shows an email", async () => {
    const { owner, projectId } = await setup();
    await db().sql`UPDATE users SET display_name = NULL WHERE id = ${owner.id}`;
    await addEntry(projectId, owner.id, "Plan sprint");
    const { meta, raw } = await activityMeta(owner, projectId, "Plan sprint");
    expect(meta.actorName).toBe("a teammate");
    expect(raw).not.toContain("owner@example.com");
  });

  it("shows no name for older entries that have no author", async () => {
    const { owner, projectId } = await setup();
    await addEntry(projectId, null, "Old entry");
    const { meta } = await activityMeta(owner, projectId, "Old entry");
    expect(meta.actorName ?? null).toBeNull();
  });
});
