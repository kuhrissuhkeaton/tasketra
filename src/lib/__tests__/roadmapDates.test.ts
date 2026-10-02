import { describe, it, expect } from "vitest";
import { fmtRoadmapRange } from "../roadmapDates";

// Normalise the non-breaking and thin spaces so the assertions read plainly.
const plain = (s: string) => s.replace(/[\u00a0\u2009\u202f]/g, " ");

describe("fmtRoadmapRange", () => {
  it("says Undated with no start date", () => {
    expect(fmtRoadmapRange(null, null)).toBe("Undated");
    expect(fmtRoadmapRange(null, "2026-09-30")).toBe("Undated");
  });
  it("shows a single date when there is no end or the end is the same day", () => {
    expect(plain(fmtRoadmapRange("2026-09-15", null))).toBe("Sep 15, 2026");
    expect(plain(fmtRoadmapRange("2026-09-15T00:00:00.000Z", "2026-09-15"))).toBe("Sep 15, 2026");
  });
  it("does not repeat the month or year within one month", () => {
    const out = plain(fmtRoadmapRange("2026-09-01", "2026-09-30"));
    expect(out).toMatch(/^Sep 1 .{1,3} 30, 2026$/);
  });
  it("repeats the month but not the year within one year", () => {
    const out = plain(fmtRoadmapRange("2026-09-20", "2026-10-25"));
    expect(out).toMatch(/^Sep 20 .{1,3} Oct 25, 2026$/);
  });
  it("shows both years when they differ", () => {
    const out = plain(fmtRoadmapRange("2026-12-15", "2027-01-10"));
    expect(out).toMatch(/^Dec 15, 2026 .{1,3} Jan 10, 2027$/);
  });
  it("never breaks inside a date (only at the dash)", () => {
    const out = fmtRoadmapRange("2026-09-20", "2026-10-25");
    expect(out).not.toMatch(/Sep 20/); // the space inside the date is non-breaking
    expect(out).toContain("Sep\u00a020");
  });
});
