import { describe, it, expect } from "vitest";
import { projectHealth } from "../portfolioHealth.ts";

const BASE = { overdueTasks: 0, highRisks: 0, highIssues: 0, cpi: null, spi: null, offTrackObjectives: 0, atRiskObjectives: 0 };

describe("projectHealth", () => {
  it("is on_track when nothing is alarming", () => {
    expect(projectHealth(BASE)).toBe("on_track");
  });

  it("a single critical/high issue always forces off_track on its own", () => {
    expect(projectHealth({ ...BASE, highIssues: 1 })).toBe("off_track");
  });

  it("an off-track objective always forces off_track on its own", () => {
    expect(projectHealth({ ...BASE, offTrackObjectives: 1 })).toBe("off_track");
  });

  it("a couple of overdue tasks alone is at_risk, not off_track", () => {
    expect(projectHealth({ ...BASE, overdueTasks: 2 })).toBe("at_risk");
  });

  it("running behind on both cost and schedule (CPI and SPI below 0.9) reads as at_risk", () => {
    expect(projectHealth({ ...BASE, cpi: 0.7, spi: 0.8 })).toBe("at_risk");
  });

  it("a pile of smaller warning signs together escalates to off_track", () => {
    expect(projectHealth({ ...BASE, overdueTasks: 3, highRisks: 2, atRiskObjectives: 2 })).toBe("off_track");
  });

  it("a healthy CPI/SPI at or above 0.9 doesn't count against a project", () => {
    expect(projectHealth({ ...BASE, cpi: 0.95, spi: 1.1 })).toBe("on_track");
  });
});
