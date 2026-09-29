import { describe, it, expect } from "vitest";
import { computeVariance, dateOnly, snapshotTasks } from "../baseline.ts";

const t = (id: string, start: string | null, due: string | null, title = id) => ({ id, title, start, due });

describe("dateOnly", () => {
  it("normalizes dates, strings and empties", () => {
    expect(dateOnly(new Date("2026-10-06T00:00:00Z"))).toBe("2026-10-06");
    expect(dateOnly("2026-10-06T00:00:00.000Z")).toBe("2026-10-06");
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly("")).toBeNull();
  });
});

describe("snapshotTasks", () => {
  it("keeps id, title and both dates", () => {
    expect(snapshotTasks([{ id: "a", title: "A", start_date: "2026-10-01", due_date: new Date("2026-10-05T00:00:00Z") }]))
      .toEqual([t("a", "2026-10-01", "2026-10-05", "A")]);
  });
});

describe("computeVariance", () => {
  const base = { budget: 50000, reserve: 5000, tasks: [t("a", "2026-10-01", "2026-10-05"), t("b", null, "2026-10-10"), t("c", null, null)] };

  it("reports nothing when nothing changed", () => {
    const v = computeVariance(base, base);
    expect(v.movedTasks).toEqual([]);
    expect(v.addedTasks).toBe(0);
    expect(v.removedTasks).toBe(0);
    expect(v.budget.delta).toBe(0);
    expect(v.reserve.delta).toBe(0);
  });

  it("finds moved, added and removed tasks", () => {
    const now = { budget: 55000, reserve: 5000, tasks: [t("a", "2026-10-01", "2026-10-12"), t("b", null, "2026-10-10"), t("d", null, null)] };
    const v = computeVariance(base, now);
    expect(v.movedTasks).toEqual([{ id: "a", title: "a", baselineStart: "2026-10-01", baselineDue: "2026-10-05", start: "2026-10-01", due: "2026-10-12" }]);
    expect(v.addedTasks).toBe(1);
    expect(v.removedTasks).toBe(1);
    expect(v.budget).toEqual({ baseline: 50000, current: 55000, delta: 5000 });
  });

  it("treats a missing budget as zero for the delta, and null when neither has one", () => {
    expect(computeVariance({ budget: null, reserve: null, tasks: [] }, { budget: 100, reserve: null, tasks: [] }).budget.delta).toBe(100);
    expect(computeVariance({ budget: null, reserve: null, tasks: [] }, { budget: null, reserve: null, tasks: [] }).budget.delta).toBeNull();
  });
});
