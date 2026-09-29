// Front-end mirror of the tolerance shape in netlify/lib/tolerances.ts.
export type ToleranceKey = "cpi_min" | "spi_min" | "overdue_max" | "high_risks_max";
export type Tolerances = Partial<Record<ToleranceKey, number>>;
