import { describe, it, expect } from "vitest";
import { riskExposure, LEVEL_LABEL } from "../riskExposure";

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
