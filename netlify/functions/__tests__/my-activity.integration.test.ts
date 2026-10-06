import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import { logActivity } from "../../lib/activity.ts";
import { withSentry } from "../../lib/sentry.ts";
import { json } from "../../lib/http.ts";
import handler from "../my-activity.mts";

const URL = "https://app.tasketra.com/api/my-activity";

async function addEntry(projectId: string, actorId: string | null, title: string, createdAt: string) {
  await db().sql`
    INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id, created_at)
    VALUES (${projectId}, 'task', gen_random_uuid(), ${title}, 'created', ${actorId}, ${createdAt})
  `;
}

describe("activity authors", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  const logging = withSentry(async (_req: Request) => {
    const project = (await db().sql`SELECT id FROM projects LIMIT 1`)[0];
    await logActivity(db(), { projectId: project.id, entityType: "task", entityId: crypto.randomUUID(), entityTitle: "Via wrapper", action: "created" });
    return json({ ok: true });
  });

  it("records the signed-in user as the author of an entry", async () => {
    const user = await createTestUser("author@example.com");
    await createTestProject(user.id);
    await logging(asUser(user, { method: "POST", url: URL }));
    const [row] = await db().sql`SELECT actor_id FROM activity_log WHERE entity_title = 'Via wrapper'`;
    expect(row.actor_id).toBe(user.id);
  });

  it("records no author when nobody is signed in", async () => {
    const user = await createTestUser("owner@example.com");
    await createTestProject(user.id);
    await logging(new Request(URL, { method: "POST" }));
    const [row] = await db().sql`SELECT actor_id FROM activity_log WHERE entity_title = 'Via wrapper'`;
    expect(row.actor_id).toBeNull();
  });
});

describe("my-activity", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("rejects an unauthenticated request and other methods", async () => {
    expect((await handler(new Request(URL))).status).toBe(401);
    const user = await createTestUser("m@example.com");
    expect((await handler(asUser(user, { method: "POST", url: URL }))).status).toBe(405);
  });

  it("lists only my own actions, newest first, with project names", async () => {
    const me = await createTestUser("me@example.com");
    const other = await createTestUser("other@example.com");
    const mine = await createTestProject(me.id, "My Project");
    const theirs = await createTestProject(other.id, "Their Project");

    await addEntry(mine.id, me.id, "Older", "2026-10-01T10:00:00Z");
    await addEntry(mine.id, me.id, "Newer", "2026-10-02T10:00:00Z");
    await addEntry(mine.id, other.id, "By someone else", "2026-10-03T10:00:00Z");
    await addEntry(mine.id, null, "No author", "2026-10-04T10:00:00Z");
    await addEntry(theirs.id, me.id, "In a project I'm not part of", "2026-10-05T10:00:00Z");

    const res = await handler(asUser(me, { method: "GET", url: URL }));
    expect(res.status).toBe(200);
    const body = await jsonBody<{ items: { entityTitle: string; projectName: string; action: string }[] }>(res);
    expect(body.items.map((i) => i.entityTitle)).toEqual(["Newer", "Older"]);
    expect(body.items[0].projectName).toBe("My Project");
    expect(body.items[0].action).toBe("created");
  });

  it("includes projects I'm an active member of", async () => {
    const me = await createTestUser("member@example.com");
    const owner = await createTestUser("owner2@example.com");
    const shared = await createTestProject(owner.id, "Shared");
    await db().sql`INSERT INTO project_members (project_id, user_id, invited_email, status) VALUES (${shared.id}, ${me.id}, ${me.email}, 'active')`;
    await addEntry(shared.id, me.id, "Member action", "2026-10-02T10:00:00Z");
    const res = await handler(asUser(me, { method: "GET", url: URL }));
    const body = await jsonBody<{ items: { entityTitle: string }[] }>(res);
    expect(body.items.map((i) => i.entityTitle)).toEqual(["Member action"]);
  });
});
