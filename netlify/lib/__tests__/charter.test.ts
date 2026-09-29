import { describe, it, expect } from "vitest";
import { sanitizeCharter, charterWritten, charterComplete, charterObjectiveLines, CHARTER_MAX_LENGTH } from "../charter.ts";

describe("sanitizeCharter", () => {
  it("keeps known fields, trims them and drops empties", () => {
    expect(sanitizeCharter({ purpose: "  Open a clinic  ", sponsor: "   ", bogus: "x", budget: 5 })).toEqual({ purpose: "Open a clinic" });
  });
  it("caps very long text", () => {
    const c = sanitizeCharter({ purpose: "a".repeat(CHARTER_MAX_LENGTH + 50) })!;
    expect(c.purpose!.length).toBe(CHARTER_MAX_LENGTH);
  });
  it("rejects things that are not plain objects", () => {
    expect(sanitizeCharter(null)).toBeNull();
    expect(sanitizeCharter("x")).toBeNull();
    expect(sanitizeCharter([])).toBeNull();
  });
});

describe("charterWritten and charterComplete", () => {
  it("is written once there is a purpose", () => {
    expect(charterWritten({})).toBe(false);
    expect(charterWritten({ purpose: "Why" })).toBe(true);
    expect(charterWritten(undefined)).toBe(false);
  });
  it("is complete only with purpose, objectives, scope and sponsor", () => {
    expect(charterComplete({ purpose: "a", objectives: "b", scope_in: "c" })).toBe(false);
    expect(charterComplete({ purpose: "a", objectives: "b", scope_in: "c", sponsor: "d" })).toBe(true);
  });
});

describe("charterObjectiveLines", () => {
  it("splits lines and strips numbering and bullets", () => {
    expect(charterObjectiveLines("1. Licensed by Feb 1\n2) Records live\n- First patients\n\n  * Open on time")).toEqual([
      "Licensed by Feb 1", "Records live", "First patients", "Open on time",
    ]);
  });
  it("returns nothing for empty input", () => {
    expect(charterObjectiveLines(undefined)).toEqual([]);
    expect(charterObjectiveLines("  \n ")).toEqual([]);
  });
});
