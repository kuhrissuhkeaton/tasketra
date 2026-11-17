// Donut (v164, dashboard plan Phase 7 -- shared visual kit). Segments use
// the categorical palette (palette.ts), never status colors: a slice is a
// category, not a verdict. The legend under the ring lists every segment
// with its real count and its percent WITH words ("3 of 8 · 38%") -- the
// kit's every-percent-carries-words rule. Callers put the table of real
// items the plan asks for underneath the Donut themselves (it belongs to
// the surface, not the chart). Kit rule: no chart from no data -- when
// every segment is 0 the caller renders one sentence plus the creating
// action instead of this component.
export type DonutSegment = { label: string; value: number };

export function Donut({ segments, colors, centerValue, centerLabel, ariaLabel }: {
  segments: DonutSegment[];
  /** Categorical color per segment, same order. */
  colors: string[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops: string[] = [];
  segments.forEach((s, i) => {
    if (s.value <= 0 || total <= 0) return;
    const from = (acc / total) * 360;
    acc += s.value;
    const to = (acc / total) * 360;
    stops.push(`${colors[i]} ${from}deg ${to}deg`);
  });
  return (
    <div className="kit-donut-wrap">
      <div
        className="kit-donut"
        role="img"
        aria-label={ariaLabel}
        style={{ background: stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--border)" }}
      >
        <div className="kit-donut-hole">
          <div className="kit-donut-value">{centerValue}</div>
          <div className="kit-donut-label">{centerLabel}</div>
        </div>
      </div>
      <ul className="kit-donut-legend">
        {segments.map((s, i) => (
          <li key={s.label}>
            <span className="kit-donut-swatch" style={{ background: colors[i] }} aria-hidden="true" />
            <span className="kit-donut-legend-label">{s.label}</span>
            <span className="kit-donut-legend-count">
              {total > 0 ? `${s.value} of ${total} · ${Math.round((s.value / total) * 100)}%` : "0"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
