// Gauge (v164, dashboard plan Phase 7 -- shared visual kit, built once for
// the v164/v165/v166 dashboard phases). A semicircle arc in a status
// color, a plain-word label, a big number, and the "x of y" words under
// it. Kit rules, binding on every surface that uses this:
//   - every percent carries words: the caller passes `words` ("5 of 12
//     tasks done") and the gauge never shows a bare number without them;
//   - no chart from no data: when there is nothing to measure, the caller
//     renders one sentence plus the action that creates the data instead
//     of a gauge -- this component only draws a real measurement.
export type GaugeTone = "good" | "warn" | "crit" | "brand";

const TONE_COLOR: Record<GaugeTone, string> = {
  good: "var(--chart-good)",
  warn: "var(--chart-warn)",
  crit: "var(--chart-crit)",
  // The neutral portfolio tone: the Tasketra ink, for a measurement that
  // is neither good nor bad on its own (completion, time used).
  brand: "var(--ink)",
};

export function Gauge({ label, percent, tone, value, words }: {
  /** Plain-word label, e.g. "Portfolio completion". */
  label: string;
  /** 0-100 (values past 100 clamp the arc but not the number). */
  percent: number;
  tone: GaugeTone;
  /** The big number as displayed, e.g. "42%". */
  value: string;
  /** The "x of y" words under the number, e.g. "5 of 12 tasks done". */
  words: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  // Semicircle from (10, 62) to (110, 62), radius 50. pathLength=100 makes
  // the dash math read as a plain percent of the arc.
  const arc = "M 10 62 A 50 50 0 0 1 110 62";
  return (
    <div className="kit-gauge" role="img" aria-label={`${label}: ${value}, ${words}`}>
      <div className="kit-gauge-label">{label}</div>
      <svg viewBox="0 0 120 68" className="kit-gauge-svg" aria-hidden="true">
        <path d={arc} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        {clamped > 0 && (
          <path d={arc} fill="none" stroke={TONE_COLOR[tone]} strokeWidth="10" strokeLinecap="round"
            pathLength={100} strokeDasharray={`${clamped} 100`} />
        )}
      </svg>
      <div className="kit-gauge-value">{value}</div>
      <div className="kit-gauge-words">{words}</div>
    </div>
  );
}
