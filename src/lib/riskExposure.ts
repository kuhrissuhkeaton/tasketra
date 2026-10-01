export type RiskLevel = "low" | "medium" | "high";

export const LEVEL_LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

/** One read of "how worried should we be", used by the RAID tab, the matrix and the printable page. */
export function riskExposure(probability: RiskLevel, impact: RiskLevel): RiskLevel {
  if (probability === "high" && impact === "high") return "high";
  if (probability === "high" || impact === "high") return "medium";
  if (probability === "low" && impact === "low") return "low";
  return "medium";
}
