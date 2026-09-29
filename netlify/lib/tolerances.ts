// Optional escalation thresholds ("tolerances", PRINCE2-style). A project owner
// can set any of four limits; leave one blank and it is off. When a limit is
// crossed the project is flagged "needs escalation" on Home and the Dashboard.
// Nothing is ever blocked by this, it only raises a flag.

export const TOLERANCE_KEYS = ["cpi_min", "spi_min", "overdue_max", "high_risks_max"] as const;
export type ToleranceKey = (typeof TOLERANCE_KEYS)[number];
export type Tolerances = Partial<Record<ToleranceKey, number>>;

const INDEX_KEYS: ToleranceKey[] = ["cpi_min", "spi_min"];

/** Keeps only known keys with sensible numbers; blanks and junk are dropped.
 *  Returns null when the input is not a plain object. */
export function sanitizeTolerances(input: unknown): Tolerances | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Tolerances = {};
  for (const key of TOLERANCE_KEYS) {
    const raw = (input as Record<string, unknown>)[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    if (INDEX_KEYS.includes(key)) {
      if (n > 0 && n <= 5) out[key] = Math.round(n * 100) / 100;
    } else if (n >= 0 && n <= 999) {
      out[key] = Math.floor(n);
    }
  }
  return out;
}

export type ToleranceInputs = {
  cpi: number | null;
  spi: number | null;
  overdueTasks: number;
  highRisks: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The plain-English reasons a project is over its limits. Empty when it is not. */
export function evaluateTolerances(t: Tolerances | null | undefined, x: ToleranceInputs): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.cpi_min !== undefined && x.cpi !== null && x.cpi < t.cpi_min) {
    out.push(`Cost index ${x.cpi.toFixed(2)} is below your ${t.cpi_min} limit`);
  }
  if (t.spi_min !== undefined && x.spi !== null && x.spi < t.spi_min) {
    out.push(`Schedule index ${x.spi.toFixed(2)} is below your ${t.spi_min} limit`);
  }
  if (t.overdue_max !== undefined && x.overdueTasks > t.overdue_max) {
    out.push(`${plural(x.overdueTasks, "overdue task")} (limit ${t.overdue_max})`);
  }
  if (t.high_risks_max !== undefined && x.highRisks > t.high_risks_max) {
    out.push(`${plural(x.highRisks, "high risk")} (limit ${t.high_risks_max})`);
  }
  return out;
}
