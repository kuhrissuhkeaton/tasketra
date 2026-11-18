import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, jsonBody } from "./fixtures.ts";
import { createApiToken, revokeApiToken } from "../../lib/apiTokens.ts";
import { db } from "../../lib/db.ts";
import mcp from "../mcp.mts";

const U = "https://tasketra.com/api/mcp";

function rpc(raw: string | null, body: unknown, id: unknown = 1) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (raw) headers.authorization = `Bearer ${raw}`;
  return mcp(
    new Request(U, {
      method: "POST",
      headers,
      body: JSON.stringify(typeof body === "object" && body !== null && "method" in (body as any) ? { jsonrpc: "2.0", id, ...(body as any) } : body),
    })
  );
}

async function callTool(raw: string, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(raw, { method: "tools/call", params: { name, arguments: args } });
  expect(res.status).toBe(200);
  const body = await jsonBody<any>(res);
  return body.result;
}

function toolJson(result: any) {
  return JSON.parse(result.content[0].text);
}

async function seedWorld() {
  const owner = await createTestUser("mcp-owner@example.com", { foundingMember: true });
  const project = await createTestProject(owner.id, "Portal Launch");
  const database = db();
  await database.sql`
    INSERT INTO tasks (project_id, title, status, due_date, owner_name)
    VALUES (${project.id}, 'Overdue thing', 'not_started', '2020-01-01', 'Sam'),
           (${project.id}, 'Done thing', 'done', NULL, 'Sam'),
           (${project.id}, 'Future thing', 'not_started', '2999-01-01', NULL)
  `;
  await database.sql`
    INSERT INTO decision_requests (project_id, title, context, deadline, status, options, public_token)
    VALUES (${project.id}, 'Approve the charter?', 'We need a call', '2026-12-04', 'open', '[]'::jsonb, 'tok-mcp-1'),
           (${project.id}, 'Old call', NULL, NULL, 'resolved', '[]'::jsonb, 'tok-mcp-2')
  `;
  await database.sql`
    INSERT INTO risks (project_id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status)
    VALUES (${project.id}, 'Vendor slips', 'They are late', 'high', 'high', 4, 5, 'Plan B', 'Sam', 'open')
  `;
  const { raw } = await createApiToken(database, owner.id, "Test token", "read");
  return { owner, project, raw };
}

describe("mcp server", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("rejects missing and unknown tokens", async () => {
    expect((await rpc(null, { method: "tools/list" })).status).toBe(401);
    expect((await rpc("tk_notarealtoken1234567890abcdef", { method: "tools/list" })).status).toBe(401);
  });

  it("initialize negotiates the protocol version and names the server", async () => {
    const { raw } = await seedWorld();
    const res = await rpc(raw, { method: "initialize", params: { protocolVersion: "2025-03-26" } });
    expect(res.status).toBe(200);
    const body = await jsonBody<any>(res);
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("tasketra");
  });

  it("tools/list returns the seven read tools", async () => {
    const { raw } = await seedWorld();
    const res = await rpc(raw, { method: "tools/list" });
    const body = await jsonBody<any>(res);
    const names = body.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(
      ["get_decisions_waiting", "get_project_overview", "get_today", "get_weekly_sync", "list_projects", "list_risks", "list_tasks"].sort()
    );
  });

  it("list_projects and list_tasks read the seeded world", async () => {
    const { project, raw } = await seedWorld();
    const projects = toolJson(await callTool(raw, "list_projects"));
    expect(projects.projects).toHaveLength(1);
    expect(projects.projects[0].name).toBe("Portal Launch");
    expect(projects.projects[0].open_decisions).toBe(1);
    expect(projects.projects[0].overdue_tasks).toBe(1);

    const open = toolJson(await callTool(raw, "list_tasks", { project_id: project.id }));
    expect(open.tasks.map((t: any) => t.title).sort()).toEqual(["Future thing", "Overdue thing"]);
    expect(open.tasks.find((t: any) => t.title === "Overdue thing").overdue).toBe(true);

    const overdueOnly = toolJson(await callTool(raw, "list_tasks", { project_id: project.id, overdue_only: true }));
    expect(overdueOnly.tasks).toHaveLength(1);
  });

  it("get_decisions_waiting returns open decisions only, across projects", async () => {
    const { raw } = await seedWorld();
    const out = toolJson(await callTool(raw, "get_decisions_waiting"));
    expect(out.decisions).toHaveLength(1);
    expect(out.decisions[0].title).toBe("Approve the charter?");
    expect(out.decisions[0].needed_by).toBe("2026-12-04");
    expect(out.decisions[0].project).toBe("Portal Launch");
  });

  it("get_project_overview, list_risks, get_weekly_sync and get_today answer from the same data", async () => {
    const { project, raw } = await seedWorld();
    const overview = toolJson(await callTool(raw, "get_project_overview", { project_id: project.id }));
    expect(overview.project.name).toBe("Portal Launch");
    expect(overview.completion.total).toBe(3);
    expect(overview.completion.done).toBe(1);
    expect(overview.decisions).toHaveLength(1);
    expect(overview.risks[0].title).toBe("Vendor slips");

    const risks = toolJson(await callTool(raw, "list_risks", { project_id: project.id }));
    expect(risks.risks).toHaveLength(1);
    expect(risks.risks[0].exposure_score).toBe(20);

    const sync = toolJson(await callTool(raw, "get_weekly_sync", { project_id: project.id }));
    expect(sync.open_asks).toHaveLength(1);
    expect(sync.overdue_tasks).toHaveLength(1);

    const today = toolJson(await callTool(raw, "get_today"));
    expect(today.overdue.map((t: any) => t.title)).toEqual(["Overdue thing"]);
    expect(today.open_total).toBe(2);
  });

  it("a token cannot see another user's project", async () => {
    const { project } = await seedWorld();
    const stranger = await createTestUser("mcp-stranger@example.com", { foundingMember: true });
    const { raw: strangerRaw } = await createApiToken(db(), stranger.id, "Stranger", "read");
    const result = await callTool(strangerRaw, "get_project_overview", { project_id: project.id });
    expect(result.isError).toBe(true);
    const projects = toolJson(await callTool(strangerRaw, "list_projects"));
    expect(projects.projects).toEqual([]);
  });

  it("a revoked token stops working", async () => {
    const { owner, raw } = await seedWorld();
    const database = db();
    const [row] = await database.sql`SELECT id FROM api_tokens WHERE user_id = ${owner.id}`;
    await revokeApiToken(database, owner.id, row.id);
    expect((await rpc(raw, { method: "tools/list" })).status).toBe(401);
  });

  it("notifications get a 202 with no body, unknown methods a JSON-RPC error", async () => {
    const { raw } = await seedWorld();
    const note = await mcp(
      new Request(U, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${raw}` },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      })
    );
    expect(note.status).toBe(202);
    const res = await rpc(raw, { method: "resources/list" });
    const body = await jsonBody<any>(res);
    expect(body.error.code).toBe(-32601);
  });
});
