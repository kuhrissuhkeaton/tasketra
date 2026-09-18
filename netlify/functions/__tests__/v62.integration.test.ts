import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import commsHandler from "../communications.mts";
import complianceHandler from "../compliance.mts";
import projectHandler from "../project.mts";

describe("communications plan", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/communications", () => {
    it("creates an item with defaults when only audience and topic are given", async () => {
      const owner = await createTestUser("c-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Sponsor", topic: "Monthly status" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ commPlanItem: any }>(res);
      expect(body.commPlanItem.audience).toBe("Sponsor");
      expect(body.commPlanItem.frequency).toBe("weekly");
      expect(body.commPlanItem.channel).toBe("email");
    });

    it("rejects a missing topic", async () => {
      const owner = await createTestUser("c-notopic@example.com");
      const project = await createTestProject(owner.id);
      const res = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Sponsor" } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating an item", async () => {
      const owner = await createTestUser("c-owner@example.com");
      const stranger = await createTestUser("c-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await commsHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Snuck", topic: "in" } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/communications", () => {
    it("lists items ordered by audience, excluding soft-deleted ones", async () => {
      const owner = await createTestUser("c-list@example.com");
      const project = await createTestProject(owner.id);
      const create = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Zed Team", topic: "Delete me" } })
      );
      const { commPlanItem } = await jsonBody<{ commPlanItem: any }>(create);
      await commsHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/communications?id=${commPlanItem.id}` }));

      await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Ada Team", topic: "Keep me" } })
      );

      const res = await commsHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/communications?projectId=${project.id}` }));
      const body = await jsonBody<{ commPlanItems: any[] }>(res);
      expect(body.commPlanItems).toHaveLength(1);
      expect(body.commPlanItems[0].topic).toBe("Keep me");
    });
  });

  describe("PATCH /api/communications", () => {
    it("updates frequency and channel together", async () => {
      const owner = await createTestUser("c-patch@example.com");
      const project = await createTestProject(owner.id);
      const create = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Sponsor", topic: "Status" } })
      );
      const { commPlanItem } = await jsonBody<{ commPlanItem: any }>(create);

      const res = await commsHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/communications", body: { id: commPlanItem.id, frequency: "monthly", channel: "meeting" } })
      );
      const body = await jsonBody<{ commPlanItem: any }>(res);
      expect(body.commPlanItem.frequency).toBe("monthly");
      expect(body.commPlanItem.channel).toBe("meeting");
    });

    it("rejects an invalid frequency", async () => {
      const owner = await createTestUser("c-badfreq@example.com");
      const project = await createTestProject(owner.id);
      const create = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Sponsor", topic: "Status" } })
      );
      const { commPlanItem } = await jsonBody<{ commPlanItem: any }>(create);
      const res = await commsHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/communications", body: { id: commPlanItem.id, frequency: "hourly" } })
      );
      expect(res.status).toBe(400);
    });

    it("restores a soft-deleted item", async () => {
      const owner = await createTestUser("c-restore@example.com");
      const project = await createTestProject(owner.id);
      const create = await commsHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/communications", body: { projectId: project.id, audience: "Sponsor", topic: "Status" } })
      );
      const { commPlanItem } = await jsonBody<{ commPlanItem: any }>(create);
      await commsHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/communications?id=${commPlanItem.id}` }));

      await commsHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/communications", body: { id: commPlanItem.id, restore: true } }));
      const res = await commsHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/communications?projectId=${project.id}` }));
      const body = await jsonBody<{ commPlanItems: any[] }>(res);
      expect(body.commPlanItems).toHaveLength(1);
    });
  });
});

describe("compliance", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/compliance", () => {
    it("creates an item with defaults when only title is given", async () => {
      const owner = await createTestUser("comp-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await complianceHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "GDPR data retention" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ complianceItem: any }>(res);
      expect(body.complianceItem.category).toBe("regulatory");
      expect(body.complianceItem.status).toBe("not_started");
      expect(body.complianceItem.resolved_at).toBeNull();
    });

    it("blocks a stranger from creating an item", async () => {
      const owner = await createTestUser("comp-owner@example.com");
      const stranger = await createTestUser("comp-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await complianceHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/compliance", () => {
    it("sets resolved_at when status moves to compliant or non_compliant", async () => {
      const owner = await createTestUser("comp-patch@example.com");
      const project = await createTestProject(owner.id);
      const create = await complianceHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "SOC 2 review" } })
      );
      const { complianceItem } = await jsonBody<{ complianceItem: any }>(create);

      const res = await complianceHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/compliance", body: { id: complianceItem.id, status: "compliant" } })
      );
      const body = await jsonBody<{ complianceItem: any }>(res);
      expect(body.complianceItem.status).toBe("compliant");
      expect(body.complianceItem.resolved_at).not.toBeNull();
    });

    it("restores a soft-deleted item", async () => {
      const owner = await createTestUser("comp-restore@example.com");
      const project = await createTestProject(owner.id);
      const create = await complianceHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "SOC 2 review" } })
      );
      const { complianceItem } = await jsonBody<{ complianceItem: any }>(create);
      await complianceHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/compliance?id=${complianceItem.id}` }));

      await complianceHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/compliance", body: { id: complianceItem.id, restore: true } }));
      const res = await complianceHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/compliance?projectId=${project.id}` }));
      const body = await jsonBody<{ complianceItems: any[] }>(res);
      expect(body.complianceItems).toHaveLength(1);
    });
  });

  describe("GET /api/compliance", () => {
    it("orders non_compliant first", async () => {
      const owner = await createTestUser("comp-order@example.com");
      const project = await createTestProject(owner.id);
      await complianceHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "Fine so far", status: "compliant" } })
      );
      await complianceHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/compliance", body: { projectId: project.id, title: "Uh oh", status: "non_compliant" } })
      );
      const res = await complianceHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/compliance?projectId=${project.id}` }));
      const body = await jsonBody<{ complianceItems: any[] }>(res);
      expect(body.complianceItems[0].title).toBe("Uh oh");
    });
  });
});

describe("project closure", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("defaults to an empty checklist and no closed_at", async () => {
    const owner = await createTestUser("close-default@example.com");
    const project = await createTestProject(owner.id);
    const res = await projectHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/project?id=${project.id}` }));
    const body = await jsonBody<{ project: any }>(res);
    expect(body.project.closure_checklist).toEqual({});
    expect(body.project.closed_at).toBeNull();
  });

  it("saves the whole checklist object and closure notes", async () => {
    const owner = await createTestUser("close-checklist@example.com");
    const project = await createTestProject(owner.id);
    await projectHandler(
      asUser(owner, {
        method: "PATCH", url: "https://tasketra.com/api/project",
        body: { id: project.id, closureChecklist: { finalLessons: true, budgetReconciled: true }, closureNotes: "Wrapped up smoothly." },
      })
    );
    const res = await projectHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/project?id=${project.id}` }));
    const body = await jsonBody<{ project: any }>(res);
    expect(body.project.closure_checklist).toEqual({ finalLessons: true, budgetReconciled: true });
    expect(body.project.closure_notes).toBe("Wrapped up smoothly.");
  });

  it("sets and clears closed_at via closeProject/reopenProject", async () => {
    const owner = await createTestUser("close-toggle@example.com");
    const project = await createTestProject(owner.id);

    const closeRes = await projectHandler(
      asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, closeProject: true } })
    );
    const closeBody = await jsonBody<{ project: any }>(closeRes);
    expect(closeBody.project.closed_at).not.toBeNull();

    const reopenRes = await projectHandler(
      asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, reopenProject: true } })
    );
    const reopenBody = await jsonBody<{ project: any }>(reopenRes);
    expect(reopenBody.project.closed_at).toBeNull();
  });

  it("blocks a non-owner from closing the project", async () => {
    const owner = await createTestUser("close-nonowner-owner@example.com");
    const stranger = await createTestUser("close-nonowner-stranger@example.com");
    const project = await createTestProject(owner.id);
    const res = await projectHandler(
      asUser(stranger, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: project.id, closeProject: true } })
    );
    expect(res.status).toBe(404);
  });
});
