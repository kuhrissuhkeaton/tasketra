import { Link } from "react-router-dom";

// Variance bars (v164, dashboard plan Phase 7 -- shared visual kit):
// Planned vs Actual, one pair of bars per row. Color discipline from the
// plan: red/amber appear ONLY on over items -- the Actual bar is the
// neutral ink while a row is at or under plan, amber when it runs over,
// red when it runs well over (more than 10% past plan). Every row carries
// its numbers in words ("Planned $8,000 · Spent $9,200 · $1,200 over"),
// and a row with an `href` is a link through to the surface that owns the
// numbers. Kit rule: no chart from no data -- with no rows the caller
// renders one sentence plus the creating action instead.
export type VarianceRow = {
  id: string;
  label: string;
  planned: number;
  actual: number;
  href?: string;
};

export function VarianceBars({ rows, formatValue, actualWord }: {
  rows: VarianceRow[];
  formatValue: (n: number) => string;
  /** The word for the actual bar in the legend and row text ("Spent" for
   *  budgets). Defaults to "Actual". */
  actualWord?: string;
}) {
  const actualLabel = actualWord ?? "Actual";
  const max = Math.max(1, ...rows.flatMap((r) => [r.planned, r.actual]));
  return (
    <div className="kit-variance">
      <div className="kit-variance-legend" aria-hidden="true">
        <span><span className="kit-variance-key kit-variance-key-planned" /> Planned</span>
        <span><span className="kit-variance-key kit-variance-key-actual" /> {actualLabel}</span>
      </div>
      {rows.map((r) => {
        const over = r.actual - r.planned;
        const overClass = over <= 0 ? "" : r.planned > 0 && over / r.planned > 0.1 ? " kit-variance-over-hard" : " kit-variance-over";
        const words = over > 0
          ? `Planned ${formatValue(r.planned)} · ${actualLabel} ${formatValue(r.actual)} · ${formatValue(over)} over`
          : `Planned ${formatValue(r.planned)} · ${actualLabel} ${formatValue(r.actual)}`;
        const inner = (
          <>
            <div className="kit-variance-head">
              <span className="kit-variance-label">{r.label}</span>
              <span className="kit-variance-words">{words}</span>
            </div>
            <div className="kit-variance-track" aria-hidden="true">
              <div className="kit-variance-bar kit-variance-bar-planned" style={{ width: `${(r.planned / max) * 100}%` }} />
            </div>
            <div className="kit-variance-track" aria-hidden="true">
              <div className={`kit-variance-bar kit-variance-bar-actual${overClass}`} style={{ width: `${(r.actual / max) * 100}%` }} />
            </div>
          </>
        );
        return r.href ? (
          <Link key={r.id} className="kit-variance-row" to={r.href} aria-label={`${r.label}: ${words}`} title={`Open ${r.label}`}>
            {inner}
          </Link>
        ) : (
          <div key={r.id} className="kit-variance-row">{inner}</div>
        );
      })}
    </div>
  );
}
