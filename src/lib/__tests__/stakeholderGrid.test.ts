import { describe, it, expect } from "vitest";
import { quadrantOf, placeStakeholders, STAKEHOLDER_QUADRANTS } from "../stakeholderGrid";

describe("quadrantOf", () => {
  it("places the four corners", () => {
    expect(quadrantOf("high", "high")).toBe("manage_closely");
    expect(quadrantOf("high", "low")).toBe("keep_satisfied");
    expect(quadrantOf("low", "high")).toBe("keep_informed");
    expect(quadrantOf("low", "low")).toBe("monitor");
  });
  it("counts medium as the higher side", () => {
    expect(quadrantOf("medium", "medium")).toBe("manage_closely");
    expect(quadrantOf("medium", "low")).toBe("keep_satisfied");
    expect(quadrantOf("low", "medium")).toBe("keep_informed");
  });
  it("never guesses when a value is missing", () => {
    expect(quadrantOf(null, "high")).toBeNull();
    expect(quadrantOf("high", null)).toBeNull();
    expect(quadrantOf(undefined, undefined)).toBeNull();
  });
  it("has one strategy per quadrant", () => {
    expect(STAKEHOLDER_QUADRANTS.map((q) => q.id).sort()).toEqual(["keep_informed", "keep_satisfied", "manage_closely", "monitor"]);
  });
});

describe("placeStakeholders", () => {
  it("splits people into quadrants and an unplaced list", () => {
    const r = placeStakeholders([
      { id: "a", power_level: "high" as const, interest_level: "high" as const },
      { id: "b", power_level: "low" as const, interest_level: null },
      { id: "c", power_level: "low" as const, interest_level: "low" as const },
    ]);
    expect(r.byQuadrant.manage_closely.map((x) => x.id)).toEqual(["a"]);
    expect(r.byQuadrant.monitor.map((x) => x.id)).toEqual(["c"]);
    expect(r.unplaced.map((x) => x.id)).toEqual(["b"]);
  });
});
