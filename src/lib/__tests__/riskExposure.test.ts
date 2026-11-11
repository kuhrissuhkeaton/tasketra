import { describe, it, expect } from "vitest";
import { riskExposure, isHighExposureRisk, riskExposureFor, riskScore, bandForScore, LEVEL_LABEL, SCORE_LABEL } from "../riskExposure";

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

// v157: numeric scores. When both scores are present they decide on their
// own -- score >= 12 or an impact of 5 -- and the bands (which the server
// derives from the scores) no longer get a vote.
describe("isHighExposureRisk with numeric scores", () => {
  it("counts a risk whose score reaches 12, whatever its bands", () => {
    // 3 x 4: bands medium/high -- the legacy rule alone would miss this.
    expect(isHighExposureRisk({ probability: "medium", impact: "high", status: "open", probability_score: 3, impact_score: 4 })).toBe(true);
    // 4 x 3: bands high/medium.
    expect(isHighExposureRisk({ probability: "high", impact: "medium", status: "open", probability_score: 4, impact_score: 3 })).toBe(true);
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "monitoring", probability_score: 5, impact_score: 5 })).toBe(true);
  });
  it("counts an impact of 5 even below a score of 12", () => {
    expect(isHighExposureRisk({ probability: "low", impact: "high", status: "open", probability_score: 2, impact_score: 5 })).toBe(true);
    expect(isHighExposureRisk({ probability: "low", impact: "high", status: "open", probability_score: 1, impact_score: 5 })).toBe(true);
  });
  it("does not count a scored risk below the line", () => {
    expect(isHighExposureRisk({ probability: "medium", impact: "medium", status: "open", probability_score: 3, impact_score: 3 })).toBe(false);
    expect(isHighExposureRisk({ probability: "low", impact: "high", status: "open", probability_score: 2, impact_score: 4 })).toBe(false);
  });
  it("lets the scores overrule the bands in both directions", () => {
    // Both-high bands but scored 2 x 2: not high exposure.
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "open", probability_score: 2, impact_score: 2 })).toBe(false);
  });
  it("never counts a resolved risk, however it scores", () => {
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "resolved", probability_score: 4, impact_score: 4 })).toBe(false);
  });
  it("falls back to the band rule when either score is missing", () => {
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "open", probability_score: null, impact_score: null })).toBe(true);
    expect(isHighExposureRisk({ probability: "high", impact: "high", status: "open", probability_score: 1, impact_score: null })).toBe(true);
    expect(isHighExposureRisk({ probability: "medium", impact: "high", status: "open", probability_score: null, impact_score: 5 })).toBe(false);
  });
});

describe("riskScore", () => {
  it("multiplies the pair", () => {
    expect(riskScore({ probability_score: 3, impact_score: 4 })).toBe(12);
    expect(riskScore({ probability_score: 5, impact_score: 5 })).toBe(25);
    expect(riskScore({ probability_score: 1, impact_score: 1 })).toBe(1);
  });
  it("is null unless both scores are set", () => {
    expect(riskScore({ probability_score: null, impact_score: null })).toBeNull();
    expect(riskScore({ probability_score: 3, impact_score: null })).toBeNull();
    expect(riskScore({})).toBeNull();
  });
});

describe("bandForScore", () => {
  it("maps 1-2 low, 3 medium, 4-5 high", () => {
    expect(bandForScore(1)).toBe("low");
    expect(bandForScore(2)).toBe("low");
    expect(bandForScore(3)).toBe("medium");
    expect(bandForScore(4)).toBe("high");
    expect(bandForScore(5)).toBe("high");
  });
  it("has a word hint for every score", () => {
    expect(Object.keys(SCORE_LABEL).map(Number)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("riskExposureFor", () => {
  it("reads band-only risks from their bands", () => {
    expect(riskExposureFor({ probability: "high", impact: "high" })).toBe("high");
    expect(riskExposureFor({ probability: "low", impact: "high", probability_score: null, impact_score: null })).toBe("medium");
    expect(riskExposureFor({ probability: "low", impact: "low" })).toBe("low");
  });
  it("shows high for a scored risk the shared definition counts as high", () => {
    expect(riskExposureFor({ probability: "medium", impact: "high", probability_score: 3, impact_score: 4 })).toBe("high");
    expect(riskExposureFor({ probability: "low", impact: "high", probability_score: 2, impact_score: 5 })).toBe("high");
  });
  it("keeps the band read for scored risks below the line", () => {
    expect(riskExposureFor({ probability: "medium", impact: "medium", probability_score: 3, impact_score: 3 })).toBe("medium");
    expect(riskExposureFor({ probability: "low", impact: "low", probability_score: 2, impact_score: 2 })).toBe("low");
  });
});
