import { describe, it, expect } from "vitest";
import { diffSummary, formatDiffValue } from "../activity.ts";

// v151 (Part C1): activity summaries are read by people, so diffs render the
// way the app talks -- status labels, real dates, "not set" -- never raw
// stored enum names, ISO timestamps, or "--".
describe("diffSummary humanization", () => {
  const FIELDS = [
    { key: "status", label: "status" },
    { key: "due_date", label: "due" },
    { key: "owner_name", label: "owner" },
  ];

  it("renders a status change with display labels and an arrow", () => {
    expect(diffSummary({ status: "not_started" }, { status: "in_progress" }, FIELDS))
      .toBe("status: Not started → In progress");
    expect(diffSummary({ status: "open" }, { status: "resolved" }, FIELDS))
      .toBe("status: Open → Resolved");
  });

  it("renders dates as 'Dec 5, 2026' and null as 'not set'", () => {
    expect(diffSummary({ due_date: null }, { due_date: "2026-12-05" }, FIELDS))
      .toBe("due: not set → Dec 5, 2026");
    expect(diffSummary({ due_date: "2026-11-25T00:00:00.000Z" }, { due_date: "2026-12-05" }, FIELDS))
      .toBe("due: Nov 25, 2026 → Dec 5, 2026");
  });

  it("contains no raw enum names and no '->'", () => {
    const out = diffSummary(
      { status: "not_started", due_date: null },
      { status: "done", due_date: "2026-12-05" },
      FIELDS,
    );
    expect(out).not.toContain("not_started");
    expect(out).not.toContain("->");
    expect(out).not.toContain("--");
  });

  it("treats values that format the same as unchanged", () => {
    expect(diffSummary({ due_date: "2026-12-05" }, { due_date: "2026-12-05T00:00:00.000Z" }, FIELDS))
      .toBe("details updated");
  });

  it("keeps plain text values verbatim", () => {
    expect(diffSummary({ owner_name: null }, { owner_name: "Dana" }, FIELDS))
      .toBe("owner: not set → Dana");
  });

  it("honors a per-field format override", () => {
    const fields = [{ key: "status", label: "status", format: (v: any) => (v == null ? "none" : String(v).toUpperCase()) }];
    expect(diffSummary({ status: "open" }, { status: "done" }, fields)).toBe("status: OPEN → DONE");
  });
});

describe("formatDiffValue", () => {
  it("humanizes unknown status tokens and enum keys", () => {
    expect(formatDiffValue("status", "changes_requested")).toBe("Changes requested");
    expect(formatDiffValue("severity", "critical")).toBe("Critical");
    expect(formatDiffValue("priority", "high")).toBe("High");
  });

  it("leaves free text alone", () => {
    expect(formatDiffValue("title", "not_started plan")).toBe("not_started plan");
    expect(formatDiffValue("owner_name", "dana_k")).toBe("dana_k");
  });
});
