import { describe, it, expect } from "vitest";
import { tasksToICS } from "../ics.ts";
import type { Task } from "../api.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Ship the report",
    status: "in_progress",
    owner_name: "Jane",
    start_date: null,
    due_date: "2026-08-15",
    stakeholder_id: null,
    parent_task_id: null,
    ...overrides,
  };
}

describe("tasksToICS", () => {
  it("produces a valid VCALENDAR wrapper", () => {
    const ics = tasksToICS([makeTask()], "Project X");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("includes one VEVENT per task with a due date", () => {
    const ics = tasksToICS([makeTask({ id: "a" }), makeTask({ id: "b" })], "Project X");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
  });

  it("excludes tasks with no due date", () => {
    const ics = tasksToICS([makeTask({ id: "a", due_date: null })], "Project X");
    expect(ics.match(/BEGIN:VEVENT/g)).toBeNull();
  });

  it("formats the due date as YYYYMMDD for an all-day event", () => {
    const ics = tasksToICS([makeTask({ due_date: "2026-08-15" })], "Project X");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260815");
  });

  it("includes the project name and task title in the event summary", () => {
    const ics = tasksToICS([makeTask({ title: "Finalize budget" })], "Acme Rollout");
    expect(ics).toContain("SUMMARY:Finalize budget (Acme Rollout)");
  });

  it("uses an exclusive DTEND one day past a single-day task's due date", () => {
    const ics = tasksToICS([makeTask({ due_date: "2026-08-15" })], "Project X");
    expect(ics).toContain("DTEND;VALUE=DATE:20260816");
  });

  it("spans DTSTART to DTEND when a task has a start date", () => {
    const ics = tasksToICS([makeTask({ start_date: "2026-08-10", due_date: "2026-08-15" })], "Project X");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260810");
    expect(ics).toContain("DTEND;VALUE=DATE:20260816");
  });
});
