import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import apiTokens from "../api-tokens.mts";

const U = "https://tasketra.com/api/api-tokens";

describe("api tokens", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });

  it("rejects unauthenticated requests", async () => {
    const res = await apiTokens(new Request(U, { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("non-founding members can list (empty) but cannot create", async () => {
    const user = await createTestUser("tok-plain@example.com");
    const g = await apiTokens(asUser(user, { method: "GET", url: U }));
    expect(g.status).toBe(200);
    const body = await jsonBody<any>(g);
    expect(body.founding).toBe(false);
    expect(body.tokens).toEqual([]);
    const p = await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "My Claude", scope: "read" } }));
    expect(p.status).toBe(403);
  });

  it("founding member creates a token; the raw value appears once and never in the list", async () => {
    const user = await createTestUser("tok-founder@example.com", { foundingMember: true });
    const p = await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "My Claude", scope: "read" } }));
    expect(p.status).toBe(201);
    const created = await jsonBody<any>(p);
    expect(created.raw.startsWith("tk_")).toBe(true);
    expect(created.token.name).toBe("My Claude");
    expect(created.token.scope).toBe("read");

    const g = await apiTokens(asUser(user, { method: "GET", url: U }));
    const body = await jsonBody<any>(g);
    expect(body.founding).toBe(true);
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0].token_prefix).toBe(created.raw.slice(0, 11));
    expect(JSON.stringify(body)).not.toContain(created.raw);
  });

  it("validates name and scope", async () => {
    const user = await createTestUser("tok-valid@example.com", { foundingMember: true });
    expect((await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "", scope: "read" } }))).status).toBe(400);
    expect((await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "X", scope: "admin" } }))).status).toBe(400);
    expect((await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "X", scope: "write" } }))).status).toBe(201);
  });

  it("revoke removes the token from the list and cannot be repeated or done by someone else", async () => {
    const user = await createTestUser("tok-revoke@example.com", { foundingMember: true });
    const other = await createTestUser("tok-other@example.com", { foundingMember: true });
    const p = await apiTokens(asUser(user, { method: "POST", url: U, body: { name: "Temp", scope: "read" } }));
    const { token } = await jsonBody<any>(p);

    const byOther = await apiTokens(asUser(other, { method: "DELETE", url: `${U}?id=${token.id}` }));
    expect(byOther.status).toBe(404);

    const del = await apiTokens(asUser(user, { method: "DELETE", url: `${U}?id=${token.id}` }));
    expect(del.status).toBe(200);
    const g = await apiTokens(asUser(user, { method: "GET", url: U }));
    expect((await jsonBody<any>(g)).tokens).toEqual([]);
    const again = await apiTokens(asUser(user, { method: "DELETE", url: `${U}?id=${token.id}` }));
    expect(again.status).toBe(404);
  });
});
