import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../trash.mts";

describe("empty trash permanently deletes soft-deleted items", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  async function trashUrl(projectId: string) {
    return `https://app.tasketra.com/api/trash?projectId=${projectId}`;
  }

  async function seedTrashed(projectId: string, ownerId: string) {
    await db().sql`
      INSERT INTO tasks (project_id, title, deleted_at) VALUES (${projectId}, 'Trashed task', now())
    `;
    await db().sql`
      INSERT INTO tasks (project_id, title) VALUES (${projectId}, 'Live task')
    `;
    await db().sql`
      INSERT INTO risks (project_id, title, deleted_at) VALUES (${projectId}, 'Trashed risk', now())
    `;
    await db().sql`
      INSERT INTO documents (project_id, uploaded_by, filename, mime_type, size_bytes, blob_key, deleted_at)
      VALUES (${projectId}, ${ownerId}, 'gone.pdf', 'application/pdf', 10, gen_random_uuid(), now())
    `;
  }

  it("removes trashed rows across types, keeps live rows, and reports the count", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    await seedTrashed(project.id, owner.id);

    const res = await handler(asUser(owner, { method: "DELETE", url: await trashUrl(project.id) }));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body).toMatchObject({ ok: true, deleted: 3 });

    const [tasks] = await db().sql`SELECT COUNT(*) AS n FROM tasks WHERE project_id = ${project.id}`;
    expect(Number(tasks.n)).toBe(1); // only the live task remains
    const [risks] = await db().sql`SELECT COUNT(*) AS n FROM risks WHERE project_id = ${project.id}`;
    expect(Number(risks.n)).toBe(0);
    const [docs] = await db().sql`SELECT COUNT(*) AS n FROM documents WHERE project_id = ${project.id}`;
    expect(Number(docs.n)).toBe(0);

    const list = await handler(asUser(owner, { method: "GET", url: await trashUrl(project.id) }));
    expect((await jsonBody(list)).items).toEqual([]);
  });

  it("does not touch another project's trash", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    const other = await createTestProject(owner.id, "Other Project");
    await seedTrashed(project.id, owner.id);
    await seedTrashed(other.id, owner.id);

    const res = await handler(asUser(owner, { method: "DELETE", url: await trashUrl(project.id) }));
    expect(res.status).toBe(200);

    const [otherTasks] = await db().sql`SELECT COUNT(*) AS n FROM tasks WHERE project_id = ${other.id} AND deleted_at IS NOT NULL`;
    expect(Number(otherTasks.n)).toBe(1);
  });

  it("is a no-op success when the trash is already empty", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);

    const res = await handler(asUser(owner, { method: "DELETE", url: await trashUrl(project.id) }));
    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toMatchObject({ ok: true, deleted: 0 });
  });

  it("refuses a user with no access to the project", async () => {
    const owner = await createTestUser("owner@example.com");
    const stranger = await createTestUser("stranger@example.com");
    const project = await createTestProject(owner.id);
    await seedTrashed(project.id, owner.id);

    const res = await handler(asUser(stranger, { method: "DELETE", url: await trashUrl(project.id) }));
    expect(res.status).toBe(404);

    const [tasks] = await db().sql`SELECT COUNT(*) AS n FROM tasks WHERE project_id = ${project.id} AND deleted_at IS NOT NULL`;
    expect(Number(tasks.n)).toBe(1); // untouched
  });
});
