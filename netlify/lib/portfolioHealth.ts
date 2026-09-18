// A one-glance health read per project for the portfolio dashboard --
// deliberately the same weighted-score shape as src/lib/capacity.ts's
// capacityLevel, for the same reason: a handful of independently-alarming
// signals (overdue work, a critical issue, budget running hot, a goal
// that's off track) should each be able to tip the verdict on their own,
// not get averaged away by everything that's fine.

export type ProjectHealthLevel = "on_track" | "at_risk" | "off_track";

export type ProjectHealthInput = {
  overdueTasks: number;
  highRisks: number;
  highIssues: number;
  cpi: number | null; // cost performance index, null when no budget baseline is set
  spi: number | null; // schedule performance index
  offTrackObjectives: number;
  atRiskObjectives: number;
};

export function projectHealth(input: ProjectHealthInput): ProjectHealthLevel {
  const budgetBehind = (input.cpi !== null && input.cpi < 0.9) || (input.spi !== null && input.spi < 0.9);
  const score =
    input.overdueTasks * 2 +
    input.highIssues * 3 +
    input.highRisks * 1.5 +
    input.offTrackObjectives * 3 +
    input.atRiskObjectives * 1 +
    (budgetBehind ? 3 : 0);

  if (score >= 8 || input.highIssues >= 1 || input.offTrackObjectives >= 1) return "off_track";
  if (score >= 2) return "at_risk";
  return "on_track";
}
