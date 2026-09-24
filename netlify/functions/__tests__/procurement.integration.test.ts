import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import procurementHandler from "../procurement.mts";

describe("procurement", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("POST /api/procurement", () => {
    it("creates an item with defaults when only vendorName is given", async () => {
      const owner = await createTestUser("p-create@example.com");
      const project = await createTestProject(owner.id);
      const res = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme Consulting" } })
      );
      expect(res.status).toBe(201);
      const body = await jsonBody<{ procurementItem: any }>(res);
      expect(body.procurementItem.vendor_name).toBe("Acme Consulting");
      expect(body.procurementItem.category).toBe("vendor");
      expect(body.procurementItem.status).toBe("requested");
      expect(body.procurementItem.cost).toBeNull();
      expect(body.procurementItem.closed_at).toBeNull();
    });

    it("rejects a missing vendorName", async () => {
      const owner = await createTestUser("p-notitle@example.com");
      const project = await createTestProject(owner.id);
      const res = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id } })
      );
      expect(res.status).toBe(400);
    });

    it("rejects a non-numeric cost", async () => {
      const owner = await createTestUser("p-badcost@example.com");
      const project = await createTestProject(owner.id);
      const res = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme", cost: "not-a-number" } })
      );
      expect(res.status).toBe(400);
    });

    it("blocks a stranger from creating an item", async () => {
      const owner = await createTestUser("p-owner@example.com");
      const stranger = await createTestUser("p-stranger@example.com");
      const project = await createTestProject(owner.id);
      const res = await procurementHandler(
        asUser(stranger, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Snuck in" } })
      );
      expect(res.status).toBe(404);
    });

    it("saves cost, category, and dates together", async () => {
      const owner = await createTestUser("p-full@example.com");
      const project = await createTestProject(owner.id);
      const res = await procurementHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/procurement",
          body: {
            projectId: project.id, vendorName: "Northwind SOW", category: "contract", status: "active",
            cost: 12500.5, startDate: "2026-10-01", endDate: "2027-01-31",
          },
        })
      );
      const body = await jsonBody<{ procurementItem: any }>(res);
      expect(body.procurementItem.category).toBe("contract");
      expect(body.procurementItem.status).toBe("active");
      expect(Number(body.procurementItem.cost)).toBe(12500.5);
      expect(body.procurementItem.closed_at).toBeNull();
    });

    it("saves vendor category, sub-category, and role, defaulting to null when omitted", async () => {
      const owner = await createTestUser("p-vendorcat@example.com");
      const project = await createTestProject(owner.id);
      const withFields = await procurementHandler(
        asUser(owner, {
          method: "POST", url: "https://tasketra.com/api/procurement",
          body: {
            projectId: project.id, vendorName: "Acme Catering",
            vendorCategory: "Catering", vendorSubcategory: "Event catering", role: "Vendor for",
          },
        })
      );
      const withFieldsBody = await jsonBody<{ procurementItem: any }>(withFields);
      expect(withFieldsBody.procurementItem.vendor_category).toBe("Catering");
      expect(withFieldsBody.procurementItem.vendor_subcategory).toBe("Event catering");
      expect(withFieldsBody.procurementItem.role).toBe("Vendor for");

      const withoutFields = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "No categorization yet" } })
      );
      const withoutFieldsBody = await jsonBody<{ procurementItem: any }>(withoutFields);
      expect(withoutFieldsBody.procurementItem.vendor_category).toBeNull();
      expect(withoutFieldsBody.procurementItem.vendor_subcategory).toBeNull();
      expect(withoutFieldsBody.procurementItem.role).toBeNull();
    });
  });

  describe("GET /api/procurement", () => {
    it("lists items, excluding soft-deleted ones", async () => {
      const owner = await createTestUser("p-list@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Delete me" } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);
      await procurementHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/procurement?id=${procurementItem.id}` }));

      const create2 = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Keep me" } })
      );
      await jsonBody(create2);

      const res = await procurementHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/procurement?projectId=${project.id}` }));
      const body = await jsonBody<{ procurementItems: any[] }>(res);
      expect(body.procurementItems).toHaveLength(1);
      expect(body.procurementItems[0].vendor_name).toBe("Keep me");
    });
  });

  describe("PATCH /api/procurement", () => {
    it("sets closed_at when status moves to completed or cancelled", async () => {
      const owner = await createTestUser("p-patch@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme" } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);

      const res = await procurementHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/procurement", body: { id: procurementItem.id, status: "completed" } })
      );
      const body = await jsonBody<{ procurementItem: any }>(res);
      expect(body.procurementItem.status).toBe("completed");
      expect(body.procurementItem.closed_at).not.toBeNull();
    });

    it("updates cost without clobbering other fields", async () => {
      const owner = await createTestUser("p-costupdate@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme", cost: 100 } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);

      const res = await procurementHandler(
        asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/procurement", body: { id: procurementItem.id, cost: 250 } })
      );
      const body = await jsonBody<{ procurementItem: any }>(res);
      expect(Number(body.procurementItem.cost)).toBe(250);
      expect(body.procurementItem.vendor_name).toBe("Acme");
    });

    it("updates vendor category, sub-category, and role without clobbering other fields", async () => {
      const owner = await createTestUser("p-vendorcatpatch@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme", cost: 100 } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);

      const res = await procurementHandler(
        asUser(owner, {
          method: "PATCH", url: "https://tasketra.com/api/procurement",
          body: { id: procurementItem.id, vendorCategory: "Software", vendorSubcategory: "SaaS", role: "Vendor for" },
        })
      );
      const body = await jsonBody<{ procurementItem: any }>(res);
      expect(body.procurementItem.vendor_category).toBe("Software");
      expect(body.procurementItem.vendor_subcategory).toBe("SaaS");
      expect(body.procurementItem.role).toBe("Vendor for");
      expect(Number(body.procurementItem.cost)).toBe(100);
      expect(body.procurementItem.vendor_name).toBe("Acme");
    });

    it("restores a soft-deleted item", async () => {
      const owner = await createTestUser("p-restore@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme" } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);
      await procurementHandler(asUser(owner, { method: "DELETE", url: `https://tasketra.com/api/procurement?id=${procurementItem.id}` }));

      await procurementHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/procurement", body: { id: procurementItem.id, restore: true } }));
      const res = await procurementHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/procurement?projectId=${project.id}` }));
      const body = await jsonBody<{ procurementItems: any[] }>(res);
      expect(body.procurementItems).toHaveLength(1);
    });
  });

  describe("DELETE /api/procurement", () => {
    it("blocks a stranger from deleting an item", async () => {
      const owner = await createTestUser("p-delowner@example.com");
      const stranger = await createTestUser("p-delstranger@example.com");
      const project = await createTestProject(owner.id);
      const create = await procurementHandler(
        asUser(owner, { method: "POST", url: "https://tasketra.com/api/procurement", body: { projectId: project.id, vendorName: "Acme" } })
      );
      const { procurementItem } = await jsonBody<{ procurementItem: any }>(create);
      const res = await procurementHandler(
        asUser(stranger, { method: "DELETE", url: `https://tasketra.com/api/procurement?id=${procurementItem.id}` })
      );
      expect(res.status).toBe(404);
    });
  });
});
