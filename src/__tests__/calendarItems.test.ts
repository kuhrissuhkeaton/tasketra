import { describe, it, expect } from "vitest";
import {
  daysBetween,
  monthKeyOf,
  shiftMonth,
  monthLabel,
  monthRange,
  monthCells,
  groupItemsByDate,
  kindsOnDay,
  groupDayItems,
} from "../lib/calendarItems";
import type { CalendarItem } from "../lib/api";

const I = (o: Partial<CalendarItem>): CalendarItem => ({
  id: "i", kind: "task", date: "2026-11-03", title: "Thing", status: "open",
  project_id: "p1", project_name: "Project One", ...o,
});

describe("date key math", () => {
  it("counts whole days between keys, across months and in both directions", () => {
    expect(daysBetween("2026-11-03", "2026-11-03")).toBe(0);
    expect(daysBetween("2026-10-30", "2026-11-03")).toBe(4);
    expect(daysBetween("2026-11-03", "2026-10-30")).toBe(-4);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("derives and shifts month keys across year boundaries", () => {
    expect(monthKeyOf("2026-11-03")).toBe("2026-11");
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -11)).toBe("2025-12");
  });

  it("labels a month for the calendar header", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });
});

describe("monthRange and monthCells", () => {
  it("pads November 2026 to full Sunday-start weeks", () => {
    // Nov 1 2026 is a Sunday and Nov 30 is a Monday, so only trailing padding.
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-12-05" });
    const cells = monthCells("2026-11");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ key: "2026-11-01", day: 1, inMonth: true });
    expect(cells[cells.length - 1]).toEqual({ key: "2026-12-05", day: 5, inMonth: false });
  });

  it("pads on both sides when the month starts mid-week", () => {
    // Oct 1 2026 is a Thursday and Oct 31 is a Saturday.
    expect(monthRange("2026-10")).toEqual({ from: "2026-09-27", to: "2026-10-31" });
    const cells = monthCells("2026-10");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ key: "2026-09-27", day: 27, inMonth: false });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("needs six weeks for a month that spans them", () => {
    // Aug 1 2026 is a Saturday and Aug 31 is a Monday.
    const cells = monthCells("2026-08");
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe("2026-07-26");
    expect(cells[cells.length - 1].key).toBe("2026-09-05");
  });

  it("keeps the range inside the endpoint's 62-day cap for every month", () => {
    for (let m = 1; m <= 12; m++) {
      const { from, to } = monthRange(`2026-${String(m).padStart(2, "0")}`);
      expect(daysBetween(from, to) + 1).toBeLessThanOrEqual(42);
    }
  });
});

describe("grouping", () => {
  it("groups items by their date string", () => {
    const byDate = groupItemsByDate([
      I({ id: "1", date: "2026-11-03" }),
      I({ id: "2", date: "2026-11-03", kind: "milestone" }),
      I({ id: "3", date: "2026-11-10" }),
    ]);
    expect(byDate.get("2026-11-03")?.map((i) => i.id)).toEqual(["1", "2"]);
    expect(byDate.get("2026-11-10")?.map((i) => i.id)).toEqual(["3"]);
    expect(byDate.get("2026-11-04")).toBeUndefined();
  });

  it("reports the kinds on a day once each, in display order, for the dots", () => {
    const items = [
      I({ kind: "decision" }),
      I({ kind: "task" }),
      I({ kind: "task", id: "2" }),
      I({ kind: "milestone", id: "3" }),
    ];
    expect(kindsOnDay(items)).toEqual(["task", "milestone", "decision"]);
    expect(kindsOnDay([])).toEqual([]);
  });

  it("splits a day into labelled groups in kind order, rows sorted by project then title", () => {
    const groups = groupDayItems([
      I({ id: "1", kind: "decision", title: "Pick a vendor", project_name: "Beta" }),
      I({ id: "2", kind: "task", title: "Write the brief", project_name: "Beta" }),
      I({ id: "3", kind: "task", title: "Book the room", project_name: "Alpha" }),
      I({ id: "4", kind: "milestone", title: "Launch", project_name: "Alpha" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Tasks due", "Milestones", "Decisions waiting"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["3", "2"]);
  });
});
