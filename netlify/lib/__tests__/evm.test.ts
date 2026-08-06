import { describe, it, expect } from "vitest";
import { computeEvmMetrics } from "../evm.ts";

describe("computeEvmMetrics", () => {
  it("returns pv%/ev%/ac but nulls out every dollar metric when there's no budget baseline", () => {
    const result = computeEvmMetrics({ bac: null, ac: 500, totalTasks: 10, doneTasks: 4, dueTasks: 6 });
    expect(result).toEqual({
      pvPercent: 0.6, evPercent: 0.4, ac: 500,
      pv: null, ev: null, cv: null, sv: null, cpi: null, spi: null, eac: null, vac: null, tcpi: null,
    });
  });

  it("returns all nulls (except ac) when a project has zero leaf tasks", () => {
    const result = computeEvmMetrics({ bac: 1000, ac: 0, totalTasks: 0, doneTasks: 0, dueTasks: 0 });
    expect(result).toEqual({
      pvPercent: null, evPercent: null, ac: 0,
      pv: null, ev: null, cv: null, sv: null, cpi: null, spi: null, eac: null, vac: null, tcpi: null,
    });
  });

  it("computes a full textbook-matching set of metrics for a typical mid-project snapshot", () => {
    const result = computeEvmMetrics({ bac: 10000, ac: 4000, totalTasks: 10, doneTasks: 5, dueTasks: 6 });
    expect(result).toEqual({
      pvPercent: 0.6, evPercent: 0.5, ac: 4000,
      pv: 6000, ev: 5000, cv: 1000, sv: -1000,
      cpi: 1.25, spi: 0.83, eac: 8000, vac: 2000, tcpi: 0.83,
    });
  });

  it("leaves CPI/EAC/VAC null when no costs have been logged yet (AC = 0), without crashing on the division", () => {
    const result = computeEvmMetrics({ bac: 10000, ac: 0, totalTasks: 4, doneTasks: 2, dueTasks: 2 });
    expect(result).toEqual({
      pvPercent: 0.5, evPercent: 0.5, ac: 0,
      pv: 5000, ev: 5000, cv: 5000, sv: 0,
      cpi: null, spi: 1, eac: null, vac: null, tcpi: 0.5,
    });
  });

  it("leaves SPI null when PV is exactly zero (nothing due yet), without crashing on the division", () => {
    const result = computeEvmMetrics({ bac: 10000, ac: 1000, totalTasks: 4, doneTasks: 2, dueTasks: 0 });
    expect(result).toEqual({
      pvPercent: 0, evPercent: 0.5, ac: 1000,
      pv: 0, ev: 5000, cv: 4000, sv: 5000,
      cpi: 5, spi: null, eac: 2000, vac: 8000, tcpi: 0.56,
    });
  });

  it("leaves TCPI null when the remaining budget is exactly zero, without crashing on the division", () => {
    const result = computeEvmMetrics({ bac: 5000, ac: 5000, totalTasks: 2, doneTasks: 1, dueTasks: 1 });
    expect(result).toEqual({
      pvPercent: 0.5, evPercent: 0.5, ac: 5000,
      pv: 2500, ev: 2500, cv: -2500, sv: 0,
      cpi: 0.5, spi: 1, eac: 10000, vac: -5000, tcpi: null,
    });
  });
});
