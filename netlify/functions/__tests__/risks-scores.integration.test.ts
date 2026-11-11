import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import risksHandler from "../risks.mts";
import portfolioHandler from "../portfolio.mts";

// v157: risks carry optional 1-5 probability/impact scores. The pair is set
// together or not at all; saving scores also stores the bands derived from
// them (1-2 low, 3 medium, 4-5 high) so band-reading surfaces stay correct;
// and every high-exposure count (here: the portfolio rollup) uses the one
// shared rule -- scored: score >= 12 or impact score 5; unscored: both
// bands high.
const URL = "https://tasketra.com/api/risks";

async function create(owner: any, projectId: string, extra: Record<string, unknown> = {}) {
  return risksHandler(asUser(owner, { method: "POST", url: URL, body: { projectId, title: "Seed risk", ...extra } }));
}
async function patch(owner: any, id: string, body: Record<string, unknown>) {
  return risksHandler(asUser(owner, { method: "PATCH", url: URL, body: { id, ...body } }));
}

describe("risk numeric scores", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates a scored risk and derives its bands from the scores", async () => {
    const owner = await createTestUser("rs-create@example.com");
    const project = await createTestProject(owner.id);
    const res = await create(owner, project.id, { probabilityScore: 3, impactScore: 4 });
    expect(res.status).toBe(201);
    const { risk } = await jsonBody<{ risk: any }>(res);
    expect(risk.probability_score).toBe(3);
    expect(risk.impact_score).toBe(4);
    expect(risk.probability).toBe("medium");
    expect(risk.impact).toBe("high");
  });

  it("defaults to null scores and the caller's bands when unscored", async () => {
    const owner = await createTestUser("rs-default@example.com");
    const project = await createTestProject(owner.id);
    const { risk } = await jsonBody<{ risk: any }>(await create(owner, project.id, { probability: "high", impact: "low" }));
    expect(risk.probability_score).toBeNull();
    expect(risk.impact_score).toBeNull();
    expect(risk.probability).toBe("high");
    expect(risk.impact).toBe("low");
  });

  it("rejects scores that are out of range, fractional, or unpaired", async () => {
    const owner = await createTestUser("rs-invalid@example.com");
    const project = await createTestProject(owner.id);
    expect((await create(owner, project.id, { probabilityScore: 6, impactScore: 3 })).status).toBe(400);
    expect((await create(owner, project.id, { probabilityScore: 0, impactScore: 3 })).status).toBe(400);
    expect((await create(owner, project.id, { probabilityScore: 2.5, impactScore: 3 })).status).toBe(400);
    expect((await create(owner, project.id, { probabilityScore: 3 })).status).toBe(400);
    expect((await create(owner, project.id, { impactScore: 3 })).status).toBe(400);
    expect((await create(owner, project.id, { probabilityScore: "3", impactScore: 3 })).status).toBe(400);
  });

  it("sets scores on an existing band risk via PATCH, and a status-only patch leaves them alone", async () => {
    const owner = await createTestUser("rs-patch@example.com");
    const project = await createTestProject(owner.id);
    const { risk } = await jsonBody<{ risk: any }>(await create(owner, project.id, { probability: "low", impact: "low" }));

    const scored = await jsonBody<{ risk: any }>(await patch(owner, risk.id, { probabilityScore: 4, impactScore: 4 }));
    expect(scored.risk.probability_score).toBe(4);
    expect(scored.risk.impact_score).toBe(4);
    expect(scored.risk.probability).toBe("high");
    expect(scored.risk.impact).toBe("high");

    const statusOnly = await jsonBody<{ risk: any }>(await patch(owner, risk.id, { status: "monitoring" }));
    expect(statusOnly.risk.status).toBe("monitoring");
    expect(statusOnly.risk.probability_score).toBe(4);
    expect(statusOnly.risk.impact_score).toBe(4);
  });

  it("clears scores with an explicit null pair and keeps the bands", async () => {
    const owner = await createTestUser("rs-clear@example.com");
    const project = await createTestProject(owner.id);
    const { risk } = await jsonBody<{ risk: any }>(await create(owner, project.id, { probabilityScore: 3, impactScore: 4 }));

    const cleared = await jsonBody<{ risk: any }>(await patch(owner, risk.id, { probabilityScore: null, impactScore: null }));
    expect(cleared.risk.probability_score).toBeNull();
    expect(cleared.risk.impact_score).toBeNull();
    expect(cleared.risk.probability).toBe("medium");
    expect(cleared.risk.impact).toBe("high");
  });

  it("returns the scores on the GET list", async () => {
    const owner = await createTestUser("rs-list@example.com");
    const project = await createTestProject(owner.id);
    await create(owner, project.id, { probabilityScore: 5, impactScore: 2 });
    const res = await risksHandler(asUser(owner, { method: "GET", url: `${URL}?projectId=${project.id}` }));
    const { risks } = await jsonBody<{ risks: any[] }>(res);
    expect(risks[0].probability_score).toBe(5);
    expect(risks[0].impact_score).toBe(2);
  });

  it("portfolio high-risk count follows the shared scored rule", async () => {
    const owner = await createTestUser("rs-portfolio@example.com");
    const project = await createTestProject(owner.id);
    const database = db();
    // Seeded exactly as the API would store them (scores + derived bands).
    const seed = async (probability: string, impact: string, pScore: number | null, iScore: number | null, status = "open") => {
      await database.sql`
        INSERT INTO risks (project_id, title, probability, impact, probability_score, impact_score, status)
        VALUES (${project.id}, 'Seed', ${probability}, ${impact}, ${pScore}, ${iScore}, ${status})
      `;
    };
    await seed("medium", "high", 3, 4); // score 12 -> high (legacy rule misses it)
    await seed("low", "high", 2, 5); // impact 5 -> high (score only 10)
    await seed("medium", "medium", 3, 3); // score 9 -> not high
    await seed("high", "high", null, null); // legacy both-high -> high
    await seed("high", "high", 2, 2); // scores overrule bands -> not high
    await seed("high", "high", 5, 5, "resolved"); // resolved -> never counts

    const res = await portfolioHandler(asUser(owner, { method: "GET", url: "https://tasketra.com/api/portfolio" }));
    const data = await jsonBody<any>(res);
    const row = data.projects.find((p: any) => p.id === project.id);
    expect(row.highRisks).toBe(3);
  });
});
