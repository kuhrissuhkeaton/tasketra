export type RiskLevel = "low" | "medium" | "high";

export const LEVEL_LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

/** One read of "how worried should we be", used by the RAID tab, the matrix and the printable page. */
export function riskExposure(probability: RiskLevel, impact: RiskLevel): RiskLevel {
  if (probability === "high" && impact === "high") return "high";
  if (probability === "high" || impact === "high") return "medium";
  if (probability === "low" && impact === "low") return "low";
  return "medium";
}

export type RiskStatus = "open" | "monitoring" | "resolved";

/**
 * THE shared definition of a "high risk" for every count in the app (v156):
 * exposure reads "high" (probability AND impact both high) and the risk is
 * not resolved. The RAID register header ("N high exposure"), the project
 * health evidence, the Dashboard's high-severity totals, Weekly sync and
 * Workload all count exactly this. The server endpoints cannot import this
 * file, so their SQL mirrors it word for word:
 *   status != 'resolved' AND probability = 'high' AND impact = 'high'
 * (netlify/functions/portfolio.mts, weekly-sync.mts, workload.mts,
 * today.mts). Change the definition here and in those queries together, or
 * the counts drift apart again -- that drift was the v156 bug.
 */
export function isHighExposureRisk(r: { probability: RiskLevel; impact: RiskLevel; status: RiskStatus | string }): boolean {
  return r.status !== "resolved" && riskExposure(r.probability, r.impact) === "high";
}
