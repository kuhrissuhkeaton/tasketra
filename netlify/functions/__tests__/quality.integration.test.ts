import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import qualityHandler from "../quality.mts";
import riskHandler from "../risks.mts";
import issueHandler from "../issues.mts";
import budgetHandler from "../budget.mts";

describe("quality", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/quality", () => {
    it("creates an item with defaults when only title is given", async () => {
      const owner = await createTestUser("q-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Accessibility pass" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ qualityItem: any }>(res);
      expect(body.qualityItem.title).toBe("Accessibility pass");
      expect(body.qualityItem.category).toBe("review");
      expect(body.qualityItem.status).toBe("open");
    });

    it("rejects a missing title", async () => {
      const owner = await createTestUser("q-notitle@example.com");
      const project = await createTestProject(owner.id);
      const res = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating an item", async () => {
      const owner = await createTestUser("q-owner@example.com");
      const stranger = await createTestUser("q-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await qualityHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/quality", () => {
    it("lists items, excluding soft-deleted ones", async () => {
      const owner = await createTestUser("q-list@example.com");
      const project = await createTestProject(owner.id);
      const create = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Load test the API", category: "defect" } })
      );
      const { qualityItem } = await jsonBody<{ qualityItem: any }>(create);
      await qualityHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/quality?id=${qualityItem.id}` }));

      const create2 = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Security review" } })
      );
      await jsonBody(create2);

      const res = await qualityHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/quality?projectId=${project.id}` }));
      const body = await jsonBody<{ qualityItems: any[] }>(res);
      expect(body.qualityItems).toHaveLength(1);
      expect(body.qualityItems[0].title).toBe("Security review");
    });
  });

  describe("PATCH /api/quality", () => {
    it("sets resolved_at when status moves to passed or failed", async () => {
      const owner = await createTestUser("q-patch@example.com");
      const project = await createTestProject(owner.id);
      const create = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Load test" } })
      );
      const { qualityItem } = await jsonBody<{ qualityItem: any }>(create);

      const res = await qualityHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/quality", body: { id: qualityItem.id, status: "failed" } })
      );
      const body = await jsonBody<{ qualityItem: any }>(res);
      expect(body.qualityItem.status).toBe("failed");
      expect(body.qualityItem.resolved_at).not.toBeNull();
    });

    it("restores a soft-deleted item", async () => {
      const owner = await createTestUser("q-restore@example.com");
      const project = await createTestProject(owner.id);
      const create = await qualityHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/quality", body: { projectId: project.id, title: "Load test" } })
      );
      const { qualityItem } = await jsonBody<{ qualityItem: any }>(create);
      await qualityHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/quality?id=${qualityItem.id}` }));

      await qualityHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/quality", body: { id: qualityItem.id, restore: true } }));
      const res = await qualityHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/quality?projectId=${project.id}` }));
      const body = await jsonBody<{ qualityItems: any[] }>(res);
      expect(body.qualityItems).toHaveLength(1);
    });
  });

  describe("risk-to-issue promotion (frontend composes createIssue + updateRisk)", () => {
    it("creates a matching issue and marks the risk resolved", async () => {
      const owner = await createTestUser("q-promote@example.com");
      const project = await createTestProject(owner.id);
      const createRisk = await riskHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/risks",
          body: { projectId: project.id, title: "Vendor API might be unstable", probability: "high", impact: "high", mitigation: "Add a fallback." },
        })
      );
      const { risk } = await jsonBody<{ risk: any }>(createRisk);

      const createIssue = await issueHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/issues",
          body: { projectId: project.id, title: risk.title, description: "Promoted from a risk.", severity: "high" },
        })
      );
      expect(createIssue.status).toBe(201);
      const { issue } = await jsonBody<{ issue: any }>(createIssue);
      expect(issue.title).toBe(risk.title);
      expect(issue.severity).toBe("high");

      const resolveRisk = await riskHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/risks", body: { id: risk.id, status: "resolved" } })
      );
      const { risk: resolvedRisk } = await jsonBody<{ risk: any }>(resolveRisk);
      expect(resolvedRisk.status).toBe("resolved");
      expect(resolvedRisk.resolved_at).not.toBeNull();
    });
  });

  describe("budget contingency reserve", () => {
    it("saves and returns budgetAtCompletion and contingencyReserve together", async () => {
      const owner = await createTestUser("q-budget@example.com");
      const project = await createTestProject(owner.id);

      await budgetHandler(
        asUser(owner, {
          method: "PATCH", url: "https://tasketra.com/api/budget",
          body: { projectId: project.id, budgetAtCompletion: 50000, contingencyReserve: 5000 },
        })
      );

      const res = await budgetHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/budget?projectId=${project.id}` }));
      const body = await jsonBody<{ budgetAtCompletion: number; contingencyReserve: number }>(res);
      expect(body.budgetAtCompletion).toBe(50000);
      expect(body.contingencyReserve).toBe(5000);
    });

    it("defaults contingencyReserve to null when never set", async () => {
      const owner = await createTestUser("q-budget-null@example.com");
      const project = await createTestProject(owner.id);
      const res = await budgetHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/budget?projectId=${project.id}` }));
      const body = await jsonBody<{ contingencyReserve: number | null }>(res);
      expect(body.contingencyReserve).toBeNull();
    });
  });
});
