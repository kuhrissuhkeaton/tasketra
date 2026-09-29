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

  it("narrows the portfolio to one stage, and can combine with a project filter", async () => {
    const owner = await createTestUser("dash-stage-filter@example.com");
    const a = await createTestProject(owner.id, "Alpha");
    const b = await createTestProject(owner.id, "Beta");
    const c = await createTestProject(owner.id, "Gamma");
    const setStage = (id: string, stage: string) =>
      projectHandler(asUser(owner, { method: "PATCH", url: "https://tasketra.com/api/project", body: { id, stage } }));
    await setStage(b.id, "execute");
    await setStage(c.id, "execute");
    const get = async (qs: string) =>
      jsonBody<{ projects: { id: string }[]; kpis: { activeProjects: number } }>(
        await portfolioHandler(asUser(owner, { method: "GET", url: `https://tasketra.com/api/portfolio${qs}` })),
      );

    const execute = await get("?stage=execute");
    expect(execute.projects.map((p) => p.id).sort()).toEqual([b.id, c.id].sort());
    expect(execute.kpis.activeProjects).toBe(2);

    expect((await get("?stage=plan")).projects.map((p) => p.id)).toEqual([a.id]);
    expect((await get("?stage=close")).projects).toEqual([]);
    expect((await get(`?stage=execute&projectId=${b.id}`)).projects.map((p) => p.id)).toEqual([b.id]);
    expect((await get(`?stage=plan&projectId=${b.id}`)).projects).toEqual([]);
    expect((await get("")).projects.length).toBe(3);
  });

  it("rejects an unknown stage", async () => {
    const owner = await createTestUser("dash-stage-bad@example.com");
    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio?stage=nope" }));
    expect(res.status).toBe(400);
  });
});
