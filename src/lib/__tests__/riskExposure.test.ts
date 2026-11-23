import { describe, it, expect } from "vitest";
import { riskExposure, isHighExposureRisk, riskExposureFor, riskScore, bandForScore, LEVEL_LABEL, SCORE_LABEL, sortRisks, compareRisksByExposure } from "../riskExposure";

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

// v158: the register's default order. The panel review caught the table
// rendering in log order (10, 12, 10, 12, 12, 15, ...) while the site copy
// promised the highest-exposure risks sort themselves to the top.
describe("sortRisks by exposure", () => {
  const mk = (title: string, over: Partial<Parameters<typeof sortRisks>[0][number]> = {}) => ({
    title,
    probability: "medium" as const,
    impact: "medium" as const,
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
    probability_score: null,
    impact_score: null,
    ...over,
  });

  it("puts the highest score first (the Portal register order from the review)", () => {
    const risks = [
      mk("score 10", { probability_score: 2, impact_score: 5, probability: "low", impact: "high", created_at: "2026-01-01T00:00:00Z" }),
      mk("score 12", { probability_score: 3, impact_score: 4, probability: "medium", impact: "high", created_at: "2026-01-02T00:00:00Z" }),
      mk("score 15", { probability_score: 3, impact_score: 5, probability: "medium", impact: "high", created_at: "2026-01-03T00:00:00Z" }),
      mk("score 6", { probability_score: 2, impact_score: 3, probability: "low", impact: "medium", created_at: "2026-01-04T00:00:00Z" }),
    ];
    expect(sortRisks(risks, "exposure").map((r) => r.title)).toEqual(["score 15", "score 12", "score 10", "score 6"]);
  });

  it("keeps resolved risks last, however they score", () => {
    const risks = [
      mk("resolved 25", { probability_score: 5, impact_score: 5, probability: "high", impact: "high", status: "resolved" }),
      mk("open 4", { probability_score: 2, impact_score: 2, probability: "low", impact: "low" }),
    ];
    expect(sortRisks(risks, "exposure").map((r) => r.title)).toEqual(["open 4", "resolved 25"]);
  });

  it("orders unscored risks by their bands among the scored ones", () => {
    const risks = [
      mk("unscored low/low", { probability: "low", impact: "low" }),
      mk("unscored high/high", { probability: "high", impact: "high" }),
      mk("scored 12", { probability_score: 3, impact_score: 4, probability: "medium", impact: "high" }),
    ];
    expect(sortRisks(risks, "exposure").map((r) => r.title)).toEqual(["scored 12", "unscored high/high", "unscored low/low"]);
  });

  it("ranks a scored high-exposure risk above a both-high-band risk scored 2x2 (v173, P0-1: the snapshot/register agreement case)", () => {
    const risks = [
      mk("band high/high, scored 2x2", { probability: "high", impact: "high", probability_score: 2, impact_score: 2, created_at: "2026-01-01T00:00:00Z" }),
      mk("scored 3x4", { probability: "medium", impact: "high", probability_score: 3, impact_score: 4, created_at: "2026-01-02T00:00:00Z" }),
    ];
    expect(isHighExposureRisk(risks[0])).toBe(false);
    expect(isHighExposureRisk(risks[1])).toBe(true);
    expect(sortRisks(risks, "exposure").map((r) => r.title)).toEqual(["scored 3x4", "band high/high, scored 2x2"]);
  });

  it("breaks exact ties by log order and never mutates the input", () => {
    const risks = [
      mk("first", { probability_score: 3, impact_score: 4, probability: "medium", impact: "high", created_at: "2026-01-01T00:00:00Z" }),
      mk("second", { probability_score: 4, impact_score: 3, probability: "high", impact: "medium", created_at: "2026-01-02T00:00:00Z" }),
    ];
    const before = [...risks];
    expect(sortRisks(risks, "exposure").map((r) => r.title)).toEqual(["first", "second"]);
    expect(risks).toEqual(before);
    expect(compareRisksByExposure(risks[0], risks[1])).toBeLessThan(0);
  });

  it("supports newest-first and title orders", () => {
    const risks = [
      mk("Beta", { created_at: "2026-01-01T00:00:00Z" }),
      mk("Alpha", { created_at: "2026-01-03T00:00:00Z" }),
    ];
    expect(sortRisks(risks, "newest").map((r) => r.title)).toEqual(["Alpha", "Beta"]);
    expect(sortRisks(risks, "title").map((r) => r.title)).toEqual(["Alpha", "Beta"]);
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
