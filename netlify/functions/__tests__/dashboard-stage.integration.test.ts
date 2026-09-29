import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import projectsHandler from "../projects.mts";
import projectHandler from "../project.mts";
import portfolioHandler from "../portfolio.mts";

describe("stage on the Dashboard", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("includes each project's stage in the project list and the portfolio summary", async () => {
    const owner = await createTestUser("dash-stage@example.com");
    const a = await createTestProject(owner.id, "Alpha");
    const b = await createTestProject(owner.id, "Beta");
    await projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id: b.id, stage: "execute" } }));

    const list = await jsonBody<{ projects: { id: string; stage: string }[] }>(
      await projectsHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/projects" })),
    );
    const byId = Object.fromEntries(list.projects.map((p) => [p.id, p.stage]));
    expect(byId[a.id]).toBe("plan");
    expect(byId[b.id]).toBe("execute");

    const portfolio = await jsonBody<{ projects: { id: string; stage: string }[] }>(
      await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" })),
    );
    const pById = Object.fromEntries(portfolio.projects.map((p) => [p.id, p.stage]));
    expect(pById[a.id]).toBe("plan");
    expect(pById[b.id]).toBe("execute");
  });
});
