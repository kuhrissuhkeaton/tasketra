import { describe, it, expect } from "vitest";
import {
  addDays, bucketTasks, closedToday, daysLate, greeting, isMineOrUnassigned, localDateKey, startHere, wrapUpNote,
  type TodayTask,
} from "../lib/today";

const t = (id: string, over: Partial<TodayTask> = {}): TodayTask => ({
  id, title: `Task ${id}`, status: "not_started", owner_name: null, due_date: null,
  project_id: "p1", project_name: "Alpha", project_stage: "execute", ...over,
});
const TODAY = "2026-10-15";

describe("localDateKey / addDays", () => {
  it("formats a local date and rolls over month ends", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-15", -15)).toBe("2026-09-30");
  });
});

describe("isMineOrUnassigned", () => {
  const me = { email: "karissa@example.com", display_name: "Karissa Keaton" };
  it("counts unassigned and blank owners", () => {
    expect(isMineOrUnassigned({ owner_name: null }, me)).toBe(true);
    expect(isMineOrUnassigned({ owner_name: "   " }, me)).toBe(true);
  });
  it("matches display name, first name, email and email local part, ignoring case", () => {
    for (const o of ["Karissa Keaton", "karissa keaton", "Karissa", "karissa@example.com", "KARISSA"]) {
      expect(isMineOrUnassigned({ owner_name: o }, me)).toBe(true);
    }
  });
  it("does not match someone else", () => {
    expect(isMineOrUnassigned({ owner_name: "Sam" }, me)).toBe(false);
    expect(isMineOrUnassigned({ owner_name: "City office" }, me)).toBe(false);
  });
  it("with no display name, only email forms match", () => {
    expect(isMineOrUnassigned({ owner_name: "karissa" }, { email: "karissa@example.com" })).toBe(true);
    expect(isMineOrUnassigned({ owner_name: "Karissa Keaton" }, { email: "karissa@example.com" })).toBe(false);
  });
});

describe("bucketTasks", () => {
  it("buckets by due date, sorted oldest first, blocked tasks wait", () => {
    const b = bucketTasks([
      t("1", { due_date: "2026-10-13" }), t("2", { due_date: "2026-10-14" }), t("3", { due_date: TODAY }),
      t("4", { due_date: "2026-10-18" }), t("5", { due_date: "2026-10-22" }), t("6", { due_date: "2026-10-23" }),
      t("7"), t("8", { status: "blocked", due_date: "2026-10-01" }), t("9", { status: "done", due_date: TODAY }),
    ], TODAY);
    expect(b.overdue.map((x) => x.id)).toEqual(["1", "2"]);
    expect(b.today.map((x) => x.id)).toEqual(["3"]);
    expect(b.week.map((x) => x.id)).toEqual(["4", "5"]);
    expect(b.later.map((x) => x.id)).toEqual(["6", "7"]);
    expect(b.waiting.map((x) => x.id)).toEqual(["8"]);
  });
});

describe("startHere", () => {
  it("prefers the oldest overdue, then today, then blocked, else null", () => {
    expect(startHere(bucketTasks([t("a", { due_date: "2026-10-10" }), t("b", { due_date: "2026-10-14" }), t("c", { due_date: TODAY })], TODAY))?.task.id).toBe("a");
    expect(startHere(bucketTasks([t("c", { due_date: TODAY }), t("d", { status: "blocked" })], TODAY))).toMatchObject({ reason: "today" });
    expect(startHere(bucketTasks([t("d", { status: "blocked" })], TODAY))).toMatchObject({ reason: "blocked" });
    expect(startHere(bucketTasks([t("e", { due_date: "2026-10-18" })], TODAY))).toBeNull();
  });
});

describe("small helpers", () => {
  it("daysLate counts calendar days", () => {
    expect(daysLate("2026-10-14", TODAY)).toBe(1);
    expect(daysLate("2026-09-30", TODAY)).toBe(15);
  });
  it("greeting follows the hour", () => {
    expect([greeting(8), greeting(13), greeting(20)]).toEqual(["Good morning", "Good afternoon", "Good evening"]);
  });
  it("closedToday only counts the viewer's local day", () => {
    const noon = new Date(2026, 9, 15, 12).toISOString();
    const yesterday = new Date(2026, 9, 14, 12).toISOString();
    expect(closedToday([{ updated_at: noon }, { updated_at: yesterday }], TODAY)).toBe(1);
  });
  it("wrapUpNote reads naturally", () => {
    expect(wrapUpNote(1, 0, 0)).toBe("Closed 1 item today.");
    expect(wrapUpNote(3, 2, 1)).toBe("Closed 3 items today. 2 moving to tomorrow. 1 waiting on others.");
  });
});
