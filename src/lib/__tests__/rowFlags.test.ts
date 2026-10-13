import { describe, it, expect } from "vitest";
import { daysUntil, lateFlag, expiryFlag } from "../rowFlags";

const now = new Date(2026, 9, 13, 15, 30); // Oct 13, 2026, mid-afternoon

describe("rowFlags", () => {
  it("counts whole days from today, for a bare date or a full timestamp", () => {
    expect(daysUntil("2026-10-13", now)).toBe(0);
    expect(daysUntil("2026-10-10", now)).toBe(-3);
    expect(daysUntil("2026-10-20T00:00:00.000Z", now)).toBe(7);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("nonsense", now)).toBeNull();
  });

  it("says how late something is, in words", () => {
    expect(lateFlag("2026-10-10", true, now)).toEqual({ text: "3 days late", bad: true });
    expect(lateFlag("2026-10-12", true, now)).toEqual({ text: "1 day late", bad: true });
    expect(lateFlag("2026-10-13", true, now)).toEqual({ text: "Due today", bad: false });
    expect(lateFlag("2026-10-20", true, now)).toBeNull();
  });

  it("never flags finished items or missing dates", () => {
    expect(lateFlag("2026-10-01", false, now)).toBeNull();
    expect(lateFlag(null, true, now)).toBeNull();
    expect(expiryFlag("2026-10-01", false, 30, now)).toBeNull();
  });

  it("warns about expiry only inside the window", () => {
    expect(expiryFlag("2026-10-20", true, 30, now)).toEqual({ text: "Due in 7 days", bad: true });
    expect(expiryFlag("2026-12-30", true, 30, now)).toBeNull();
    expect(expiryFlag("2026-10-11", true, 30, now)).toEqual({ text: "Overdue by 2 days", bad: true });
  });
});
