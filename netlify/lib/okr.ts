// Objectives & Key Results progress math, pulled out for the same reason as
// evm.ts -- pure arithmetic, unit tested without a database, called once
// here and reused everywhere a progress number is needed (the OKR tab's own
// list, and the portfolio dashboard's rollup) so there's exactly one
// definition of "how far along is this."

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type KeyResultLike = {
  metric_type: string;
  start_value: number;
  current_value: number;
  target_value: number;
};

// A key result's progress is current_value's position between start_value
// and target_value, as a 0-100 percent -- direction-agnostic, so "reduce
// churn from 10% to 2%" (a falling target) computes the same way as "grow
// signups from 0 to 500" (a rising one): both move the fraction toward 100
// as current approaches target, whichever way that is. Overshoot clamps at
// 100 rather than reporting e.g. 140%, and a target equal to start (a
// degenerate goal) is either fully done or not, with no division by zero.
export function keyResultProgress(kr: KeyResultLike): number {
  if (kr.metric_type === "boolean") return kr.current_value >= 1 ? 100 : 0;
  const span = kr.target_value - kr.start_value;
  if (span === 0) return kr.current_value >= kr.target_value ? 100 : 0;
  const pct = ((kr.current_value - kr.start_value) / span) * 100;
  return Math.max(0, Math.min(100, round1(pct)));
}

// An objective with no key results yet has no numeric progress to show --
// null, not 0, so the UI can say "no key results yet" instead of implying
// zero progress on a goal that simply hasn't been broken down yet.
export function objectiveProgress(keyResults: KeyResultLike[]): number | null {
  if (keyResults.length === 0) return null;
  const total = keyResults.reduce((sum, kr) => sum + keyResultProgress(kr), 0);
  return round1(total / keyResults.length);
}
