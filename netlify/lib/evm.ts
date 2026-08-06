// Lightweight Earned Value Management math, pulled out of budget.mts so it
// can be unit tested without a database. See budget.mts for the full model
// explanation (leaf-task-only weighting, PV%/EV% sharing one denominator).

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type EvmInput = {
  bac: number | null;
  ac: number;
  totalTasks: number;
  doneTasks: number;
  dueTasks: number;
};

export type EvmMetrics = {
  pvPercent: number | null;
  evPercent: number | null;
  ac: number;
  pv: number | null;
  ev: number | null;
  cv: number | null;
  sv: number | null;
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  vac: number | null;
  tcpi: number | null;
};

export function computeEvmMetrics({ bac, ac, totalTasks, doneTasks, dueTasks }: EvmInput): EvmMetrics {
  const pvPercent = totalTasks > 0 ? dueTasks / totalTasks : null;
  const evPercent = totalTasks > 0 ? doneTasks / totalTasks : null;

  let pv: number | null = null, ev: number | null = null, cv: number | null = null, sv: number | null = null;
  let cpi: number | null = null, spi: number | null = null, eac: number | null = null;
  let vac: number | null = null, tcpi: number | null = null;

  if (bac !== null) {
    pv = pvPercent !== null ? round2(pvPercent * bac) : null;
    ev = evPercent !== null ? round2(evPercent * bac) : null;
    if (ev !== null) {
      cv = round2(ev - ac);
      if (pv !== null) sv = round2(ev - pv);
      if (ac > 0) cpi = round2(ev / ac);
      if (pv && pv > 0) spi = round2(ev / pv);
      if (cpi && cpi > 0) {
        eac = round2(bac / cpi);
        vac = round2(bac - eac);
      }
      const remainingBudget = bac - ac;
      const remainingWork = bac - ev;
      if (remainingBudget !== 0) tcpi = round2(remainingWork / remainingBudget);
    }
  }

  return { pvPercent, evPercent, ac, pv, ev, cv, sv, cpi, spi, eac, vac, tcpi };
}
