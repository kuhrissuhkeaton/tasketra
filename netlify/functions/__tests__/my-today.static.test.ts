import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// /api/my-today feeds the Today screen and must stay read-only and access-scoped.
const src = readFileSync(new URL("../my-today.mts", import.meta.url), "utf8");

describe("my-today endpoint", () => {
  it("requires sign-in and only answers GET", () => {
    expect(src).toContain("getUserIdFromRequest");
    expect(src).toContain("status: 401");
    expect(src).toContain('req.method !== "GET"');
  });
  it("never writes", () => {
    expect(src).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
  it("scopes every query to projects the user owns or is an active member of", () => {
    const scopes = src.match(/p\.owner_id = \$\{userId\}/g) ?? [];
    expect(scopes.length).toBe(2);
    expect(src.match(/pm\.status = 'active'/g)?.length).toBe(2);
    expect(src).toContain("p.archived = false");
    expect(src).toContain("t.deleted_at IS NULL");
  });
  it("is capped", () => {
    expect(src).toContain("LIMIT ${OPEN_LIMIT}");
    expect(src).toContain("LIMIT ${DONE_LIMIT}");
  });
});
