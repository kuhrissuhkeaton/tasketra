import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import stakeholdersHandler from "../stakeholders.mts";

// v82: stakeholders gained phone, interest level, preferred contact method
// and notes. All optional; the older name/role/email behavior must not change.
const URL = "https://tasketra.com/api/stakeholders";

async function create(owner: any, projectId: string, extra: Record<string, unknown> = {}) {
  return stakeholdersHandler(asUser(owner, { method: "POST", url: URL, body: { projectId, name: "Travis", ...extra } }));
}
async function patch(owner: any, id: string, body: Record<string, unknown>) {
  return stakeholdersHandler(asUser(owner, { method: "PATCH", url: URL, body: { id, ...body } }));
}

describe("stakeholder contact details", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a stakeholder with all the new fields and returns them", async () => {
    const owner = await createTestUser("sc-create@example.com");
    const project = await createTestProject(owner.id);
    const res = await create(owner, project.id, {
      email: "t@example.com", phone: " 803-555-0142 ", interestLevel: "high", preferredContact: "phone", notes: "Prefers mornings.",
    });
    expect(res.status).toBe(201);
    const { stakeholder } = await jsonBody<{ stakeholder: any }>(res);
    expect(stakeholder.phone).toBe("803-555-0142");
    expect(stakeholder.interest_level).toBe("high");
    expect(stakeholder.preferred_contact).toBe("phone");
    expect(stakeholder.notes).toBe("Prefers mornings.");
  });

  it("defaults every new field to null when omitted", async () => {
    const owner = await createTestUser("sc-default@example.com");
    const project = await createTestProject(owner.id);
    const { stakeholder } = await jsonBody<{ stakeholder: any }>(await create(owner, project.id));
    expect(stakeholder.phone).toBeNull();
    expect(stakeholder.interest_level).toBeNull();
    expect(stakeholder.preferred_contact).toBeNull();
    expect(stakeholder.notes).toBeNull();
  });

  it("returns the new fields on GET list", async () => {
    const owner = await createTestUser("sc-list@example.com");
    const project = await createTestProject(owner.id);
    await create(owner, project.id, { interestLevel: "low", notes: "n" });
    const res = await stakeholdersHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    const { stakeholders } = await jsonBody<{ stakeholders: any[] }>(res);
    expect(stakeholders[0].interest_level).toBe("low");
    expect(stakeholders[0].notes).toBe("n");
    expect(stakeholders[0]).toHaveProperty("decisions_sent");
  });

  it("rejects an invalid interest level or contact method", async () => {
    const owner = await createTestUser("sc-invalid@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(owner, project.id, { interestLevel: "extreme" })).status).toBe(400);
    expect((await create(owner, project.id, { preferredContact: "carrier pigeon" })).status).toBe(400);
    const { stakeholder } = await jsonBody<{ stakeholder: any }>(await create(owner, project.id));
    expect((await patch(owner, stakeholder.id, { interestLevel: "extreme" })).status).toBe(400);
    expect((await patch(owner, stakeholder.id, { preferredContact: "fax" })).status).toBe(400);
  });

  it("rejects an oversized phone or notes value", async () => {
    const owner = await createTestUser("sc-size@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(owner, project.id, { phone: "1".repeat(41) })).status).toBe(400);
    expect((await create(owner, project.id, { notes: "x".repeat(5001) })).status).toBe(400);
  });

  it("sets, changes and clears each new field via PATCH without clobbering others", async () => {
    const owner = await createTestUser("sc-patch@example.com");
    const project = await createTestProject(owner.id);
    const { stakeholder } = await jsonBody<{ stakeholder: any }>(await create(owner, project.id, { email: "keep@example.com", role: "Sponsor" }));
    const p = async (body: Record<string, unknown>) => (await jsonBody<{ stakeholder: any }>(await patch(owner, stakeholder.id, body))).stakeholder;

    const set = await p({ phone: "555-123-4567", interestLevel: "medium", preferredContact: "text", notes: "Call after 3." });
    expect(set).toMatchObject({ phone: "555-123-4567", interest_level: "medium", preferred_contact: "text", notes: "Call after 3.", email: "keep@example.com", role: "Sponsor" });

    // Leaving the keys out changes nothing.
    const untouched = await p({ role: "Executive sponsor" });
    expect(untouched).toMatchObject({ role: "Executive sponsor", phone: "555-123-4567", interest_level: "medium", preferred_contact: "text", notes: "Call after 3." });

    // Empty values clear them.
    const cleared = await p({ phone: "", interestLevel: "", preferredContact: null, notes: "" });
    expect(cleared).toMatchObject({ phone: null, interest_level: null, preferred_contact: null, notes: null, email: "keep@example.com" });
  });

  it("blocks a stranger from creating or editing", async () => {
    const owner = await createTestUser("sc-owner@example.com");
    const stranger = await createTestUser("sc-stranger@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(stranger, project.id, { phone: "555-123-4567" })).status).toBe(404);
    const { stakeholder } = await jsonBody<{ stakeholder: any }>(await create(owner, project.id));
    expect((await patch(stranger, stakeholder.id, { notes: "hi" })).status).toBe(404);
  });
});
