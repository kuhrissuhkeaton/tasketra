import { describe, it, expect } from "vitest";
import { riskExposure, isHighExposureRisk, LEVEL_LABEL } from "../riskExposure";

describe("riskExposure", () => {
  it("high only when both are high", () => {
    expect(riskExposure("high", "high")).toBe("high");
  });
  it("medium when either is high, or mixed/middle", () => {
    expect(riskExposure("high", "low")).toBe("medium");
    expect(riskExposure("low", "high")).toBe("medium");
    expect(riskExposure("medium", "medium")).toBe("medium");
    expect(riskExposure("low", "medium")).toBe("medium");
  });
  it("low only when both are low", () => {
    expect(riskExposure("low", "low")).toBe("low");
  });
  it("has labels for every level", () => {
    expect(Object.keys(LEVEL_LABEL)).toEqual(["low", "medium", "high"]);
  });
});

// v156: the ONE "high risk" definition every count in the app shares --
// the register header, the health evidence and the server rollups (whose
// SQL mirrors this) must never drift back to an either-axis-high count.
describe("isHighExposureRisk", () => {
  it("counts a both-high risk that is open or being monitored", () => {
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "open" })).toBe(true);
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "monitoring" })).toBe(true);
  });
  it("does not count a resolved risk, however hot it was", () => {
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "resolved" })).toBe(false);
  });
  it("does not count a risk high on only one axis (that is medium exposure)", () => {
    expect(isHighExposureRisk({ probability: "high", impact: "low", status: "open" })).toBe(false);
    expect(isHighExposureRisk({ probability: "low", impact: "high", status: "open" })).toBe(false);
    expect(isHighExposureRisk({ probability: "medium", impact: "medium", status: "open" })).toBe(false);
  });
});
