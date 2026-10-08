import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import assumptionsHandler from "../assumptions.mts";

// Quick win (2026-10-08): assumptions gained a check_by date, the one field
// dependencies already had (needed_by) and assumptions didn't. Mirrors the
// stakeholder-contact-fields test shape (v82).
const URL = "https://tasketra.com/api/assumptions";

async function create(owner: any, projectId: string, extra: Record<string, unknown> = {}) {
  return assumptionsHandler(asUser(owner, { method: "POST", url: URL, body: { projectId, statement: "Legal will approve by Friday", ...extra } }));
}
async function patch(owner: any, id: string, body: Record<string, unknown>) {
  return assumptionsHandler(asUser(owner, { method: "PATCH", url: URL, body: { id, ...body } }));
}

describe("assumption check-by date", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates an assumption with a check-by date and returns it", async () => {
    const owner = await createTestUser("acb-create@example.com");
    const project = await createTestProject(owner.id);
    const res = await create(owner, project.id, { checkBy: "2026-11-01" });
    expect(res.status).toBe(201);
    const { assumption } = await jsonBody<{ assumption: any }>(res);
    expect(assumption.check_by).toContain("2026-11-01");
  });

  it("defaults check_by to null when omitted", async () => {
    const owner = await createTestUser("acb-default@example.com");
    const project = await createTestProject(owner.id);
    const { assumption } = await jsonBody<{ assumption: any }>(await create(owner, project.id));
    expect(assumption.check_by).toBeNull();
  });

  it("returns check_by on GET list", async () => {
    const owner = await createTestUser("acb-list@example.com");
    const project = await createTestProject(owner.id);
    await create(owner, project.id, { checkBy: "2026-12-15" });
    const res = await assumptionsHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    const { assumptions } = await jsonBody<{ assumptions: any[] }>(res);
    expect(assumptions[0].check_by).toContain("2026-12-15");
  });

  it("sets check_by via PATCH without clobbering other fields", async () => {
    const owner = await createTestUser("acb-patch@example.com");
    const project = await createTestProject(owner.id);
    const { assumption } = await jsonBody<{ assumption: any }>(await create(owner, project.id, { ownerName: "Karissa", notes: "keep this" }));

    const set = await jsonBody<{ assumption: any }>(await patch(owner, assumption.id, { checkBy: "2026-11-20" }));
    expect(set.assumption.check_by).toContain("2026-11-20");
    expect(set.assumption.owner_name).toBe("Karissa");
    expect(set.assumption.notes).toBe("keep this");

    // Leaving it out on a later patch changes nothing.
    const untouched = await jsonBody<{ assumption: any }>(await patch(owner, assumption.id, { ownerName: "New owner" }));
    expect(untouched.assumption.check_by).toContain("2026-11-20");
    expect(untouched.assumption.owner_name).toBe("New owner");
  });

  it("blocks a stranger from creating or editing", async () => {
    const owner = await createTestUser("acb-owner@example.com");
    const stranger = await createTestUser("acb-stranger@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(stranger, project.id, { checkBy: "2026-11-01" })).status).toBe(404);
    const { assumption } = await jsonBody<{ assumption: any }>(await create(owner, project.id));
    expect((await patch(stranger, assumption.id, { checkBy: "2026-11-01" })).status).toBe(404);
  });
});
