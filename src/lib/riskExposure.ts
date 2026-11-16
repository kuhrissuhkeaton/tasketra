export type RiskLevel = "low" | "medium" | "high";

export const LEVEL_LABEL: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

/** One read of "how worried should we be", used by the RAID tab, the matrix and the printable page. */
export function riskExposure(probability: RiskLevel, impact: RiskLevel): RiskLevel {
  if (probability === "high" && impact === "high") return "high";
  if (probability === "high" || impact === "high") return "medium";
  if (probability === "low" && impact === "low") return "low";
  return "medium";
}

/** The word hints next to each 1-5 score in the risk form (v157). */
export const SCORE_LABEL: Record<number, string> = {
  1: "Very low",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Very high",
};

/**
 * The band a 1-5 score lands in: 1-2 low, 3 medium, 4-5 high. The server
 * derives and stores the bands from the scores on every save (its own copy
 * of this mapping lives in netlify/functions/risks.mts), so surfaces that
 * read bands -- the risk matrix, print, exports -- stay correct for scored
 * risks without knowing scores exist.
 */
export function bandForScore(score: number): RiskLevel {
  if (score <= 2) return "low";
  if (score === 3) return "medium";
  return "high";
}

/** The fields of a risk the score-aware reads below look at. */
export type RiskScoring = {
  probability_score?: number | null;
  impact_score?: number | null;
};

/**
 * A risk's numeric score (probability x impact, 1-25), or null when it
 * carries no numbers. Risks logged before v157 have null scores until
 * someone edits them; the pair is only ever set together.
 */
export function riskScore(r: RiskScoring): number | null {
  if (r.probability_score == null || r.impact_score == null) return null;
  return r.probability_score * r.impact_score;
}

export type RiskStatus = "open" | "monitoring" | "resolved";

/**
 * THE shared definition of a "high risk" for every count in the app (v156,
 * extended by v157 for numeric scores): the risk is not resolved, and
 * either
 *   - it carries both numeric scores and (score >= 12 OR impact score = 5)
 *     -- the top band of the 1-5 scales real plans rank risks by, or
 *   - it has no scores and its exposure reads "high" (probability AND
 *     impact both high) -- the original v156 rule for band-only risks.
 * Scores, when present, win outright: a both-high-band risk scored 2 x 2
 * is NOT high exposure, and a medium/high-band risk scored 3 x 4 IS.
 * The RAID register header ("N high exposure"), the project health
 * evidence, the Dashboard's high-severity totals, Weekly sync and Workload
 * all count exactly this. The server endpoints cannot import this file, so
 * their SQL mirrors it word for word:
 *   status != 'resolved' AND (CASE WHEN probability_score IS NOT NULL
 *     AND impact_score IS NOT NULL
 *     THEN probability_score * impact_score >= 12 OR impact_score = 5
 *     ELSE probability = 'high' AND impact = 'high' END)
 * (netlify/functions/portfolio.mts, weekly-sync.mts, workload.mts,
 * today.mts, netlify/lib/stageData.ts). Change the definition here and in
 * those queries together, or the counts drift apart again -- that drift
 * was the v156 bug.
 */
export function isHighExposureRisk(
  r: { probability: RiskLevel; impact: RiskLevel; status: RiskStatus | string } & RiskScoring,
): boolean {
  if (r.status === "resolved") return false;
  const score = riskScore(r);
  if (score !== null) return score >= 12 || r.impact_score === 5;
  return riskExposure(r.probability, r.impact) === "high";
}

/**
 * The exposure pill for one risk, numeric-aware (v157): a scored risk that
 * the shared definition counts as high exposure shows "high" even when its
 * derived bands (medium probability x high impact, say) would only read
 * medium -- otherwise the row would disagree with the header count that
 * already includes it. Anything else reads from the bands as before.
 */
export function riskExposureFor(r: { probability: RiskLevel; impact: RiskLevel } & RiskScoring): RiskLevel {
  const score = riskScore(r);
  if (score !== null && (score >= 12 || r.impact_score === 5)) return "high";
  return riskExposure(r.probability, r.impact);
}

const BAND_VALUE: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const STATUS_RANK: Record<string, number> = { open: 0, monitoring: 1, resolved: 2 };

export type RiskSort = "exposure" | "newest" | "title";

export const RISK_SORT_LABEL: Record<RiskSort, string> = {
  exposure: "Highest exposure",
  newest: "Newest first",
  title: "Title A-Z",
};

export function isRiskSort(v: string | null): v is RiskSort {
  return v === "exposure" || v === "newest" || v === "title";
}

type SortableRisk = {
  title: string;
  probability: RiskLevel;
  impact: RiskLevel;
  status: RiskStatus | string;
  created_at: string;
} & RiskScoring;

/**
 * The register's default order (v158): the risks that can hurt the project
 * soonest read first. Open before monitoring before resolved; within a
 * status, high-exposure (the shared definition above) before the rest;
 * then by score, highest first -- a scored risk uses its real number, an
 * unscored one falls back to its band product (high/high = 9) so the two
 * kinds interleave sanely; then impact; then oldest first, matching the
 * order risks were logged in before v158 within exact ties.
 */
export function compareRisksByExposure(a: SortableRisk, b: SortableRisk): number {
  const statusDiff = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
  if (statusDiff !== 0) return statusDiff;
  const highDiff = Number(isHighExposureRisk(b)) - Number(isHighExposureRisk(a));
  if (highDiff !== 0) return highDiff;
  const scoreOf = (r: SortableRisk) => riskScore(r) ?? BAND_VALUE[r.probability] * BAND_VALUE[r.impact];
  const scoreDiff = scoreOf(b) - scoreOf(a);
  if (scoreDiff !== 0) return scoreDiff;
  const impactDiff = (b.impact_score ?? BAND_VALUE[b.impact]) - (a.impact_score ?? BAND_VALUE[a.impact]);
  if (impactDiff !== 0) return impactDiff;
  return a.created_at.localeCompare(b.created_at);
}

/** Sort a copy of the register; the input array is never mutated. */
export function sortRisks<T extends SortableRisk>(risks: T[], sort: RiskSort): T[] {
  const out = [...risks];
  if (sort === "newest") out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort(compareRisksByExposure);
  return out;
}
