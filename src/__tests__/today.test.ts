import { describe, it, expect } from "vitest";
import {
  addDays, bucketTasks, closedToday, daysLate, greeting, isAfterHours, isMineOrUnassigned, localDateKey, pickJumpProject, startHere, weekendMode, wrapUpNote,
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

describe("v163 eggs: weekendMode (Egg 4) and isAfterHours (Egg 5)", () => {
  // 2026-11-13 is a Friday; 2026-11-16 is the following Monday.
  const fri3pm = new Date(2026, 10, 13, 15, 0);
  const fri2pm = new Date(2026, 10, 13, 14, 0);
  const thu4pm = new Date(2026, 10, 12, 16, 0);

  it("is Friday afternoon with nothing due before Monday", () => {
    expect(weekendMode(fri3pm, [t("a", { due_date: "2026-11-20" }), t("b", { due_date: null })])).toBe(true);
    expect(weekendMode(fri3pm, [])).toBe(true);
  });

  it("is not weekend mode before 3 PM, or on another day", () => {
    expect(weekendMode(fri2pm, [])).toBe(false);
    expect(weekendMode(thu4pm, [])).toBe(false);
  });

  it("a task due Saturday, Sunday, or overdue kills it; a done task due Saturday does not", () => {
    expect(weekendMode(fri3pm, [t("a", { due_date: "2026-11-14" })])).toBe(false);
    expect(weekendMode(fri3pm, [t("a", { due_date: "2026-11-15" })])).toBe(false);
    expect(weekendMode(fri3pm, [t("a", { due_date: "2026-11-10" })])).toBe(false);
    expect(weekendMode(fri3pm, [t("a", { due_date: "2026-11-14", status: "done" })])).toBe(true);
  });

  it("after hours starts at 10 PM", () => {
    expect(isAfterHours(new Date(2026, 10, 13, 21, 59))).toBe(false);
    expect(isAfterHours(new Date(2026, 10, 13, 22, 0))).toBe(true);
    expect(isAfterHours(new Date(2026, 10, 13, 23, 30))).toBe(true);
  });
});

describe("pickJumpProject (v174 fix pass, proposal fallback)", () => {
  const p = (id: string, over: Record<string, unknown> = {}) => ({
    id, created_at: "2026-09-01T00:00:00Z", last_activity_at: null as string | null, closed_at: null as string | null, ...over,
  });

  it("points at the most recently active open project", () => {
    const projects = [
      p("old", { created_at: "2026-08-01T00:00:00Z", last_activity_at: "2026-11-20T00:00:00Z" }),
      p("newer-active", { created_at: "2026-09-01T00:00:00Z", last_activity_at: "2026-11-22T00:00:00Z" }),
    ];
    expect(pickJumpProject(projects)?.id).toBe("newer-active");
  });

  it("recorded activity beats a later-created project with none", () => {
    const projects = [
      p("worked-on", { created_at: "2026-08-01T00:00:00Z", last_activity_at: "2026-11-20T00:00:00Z" }),
      p("just-created", { created_at: "2026-11-23T00:00:00Z" }),
    ];
    expect(pickJumpProject(projects)?.id).toBe("worked-on");
  });

  it("with no activity anywhere, falls back to the FIRST project, not the newest", () => {
    const projects = [
      p("second", { created_at: "2026-09-15T00:00:00Z" }),
      p("first", { created_at: "2026-09-01T00:00:00Z" }),
      p("third", { created_at: "2026-10-01T00:00:00Z" }),
    ];
    expect(pickJumpProject(projects)?.id).toBe("first");
  });

  it("ignores closed projects and returns null when nothing is open", () => {
    const projects = [
      p("closed-recent", { created_at: "2026-08-01T00:00:00Z", last_activity_at: "2026-11-22T00:00:00Z", closed_at: "2026-11-23T00:00:00Z" }),
      p("open", { created_at: "2026-09-01T00:00:00Z" }),
    ];
    expect(pickJumpProject(projects)?.id).toBe("open");
    expect(pickJumpProject([p("c", { closed_at: "2026-11-23T00:00:00Z" })])).toBeNull();
    expect(pickJumpProject([])).toBeNull();
  });
});
