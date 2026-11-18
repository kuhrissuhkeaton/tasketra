// @vitest-environment jsdom
//
// Client Snapshot document (v168): the sponsor view renders the stated
// status, the three gauges, phases, milestones, plain-word risks and
// the sponsor's own decisions — and hides every section with no data.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SnapshotDocument } from "../components/SnapshotDocument";
import type { SnapshotData } from "../lib/api";

const FULL: SnapshotData = {
  status: { health: "at_risk", note: "Permits are with the city; everything else is moving.", at: "2026-11-16T14:00:00Z" },
  completion: { done: 2, total: 4, percent: 50 },
  time: { percent: 40, start: "2026-10-01", end: "2027-02-27" },
  budget: { spent: 41250, total: 605000, percent: 7 },
  phases: [
    { label: "Phase 1", total: 3, done: 2 },
    { label: "Phase 2", total: 1, done: 0 },
  ],
  phasesByStatus: false,
  milestones: [
    { title: "Permits approved", date: "2026-12-01", done: false },
    { title: "Kickoff held", date: "2026-10-05", done: true },
  ],
  risks: [
    { title: "Permit review could slip", mitigation: "Weekly check-ins with the reviewer" },
    { title: "Venue holds only until January", mitigation: null },
  ],
  decisions: [
    { title: "Approve the catering budget", deadline: "2026-11-25", owner: "Dana Sponsor" },
  ],
};

const SPARSE: SnapshotData = {
  status: null,
  completion: null,
  time: null,
  budget: null,
  phases: [],
  phasesByStatus: false,
  milestones: [],
  risks: [],
  decisions: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(data: SnapshotData) {
  act(() => {
    root.render(<SnapshotDocument projectName="Leadership Summit 2027" snapshot={data} dateLabel="As of November 18, 2026" />);
  });
  return container.textContent ?? "";
}

describe("SnapshotDocument", () => {
  it("renders the stated status, gauges, phases, milestones, risks and sponsor decisions", () => {
    const text = render(FULL);
    expect(text).toContain("Leadership Summit 2027");
    expect(text).toContain("At risk");
    expect(text).toContain("Permits are with the city; everything else is moving.");
    expect(text).toContain("2 of 4 tasks done");
    expect(text).toContain("$41,250 of $605,000 spent");
    expect(text).toContain("Phase 1");
    expect(text).toContain("Permits approved");
    expect(text).toContain("Kickoff held");
    expect(text).toContain("What we are watching");
    expect(text).toContain("Permit review could slip");
    expect(text).toContain("What we are doing about it: Weekly check-ins with the reviewer");
    expect(text).toContain("Open decisions");
    expect(text).toContain("Approve the catering budget");
    expect(text).toContain("Dana Sponsor");
    expect(text).toContain("needed by");
  });

  it("shows open decisions that have no named owner, with just the needed-by date", () => {
    const text = render({
      ...FULL,
      decisions: [{ title: "Approve the project charter", deadline: "2026-12-04", owner: null }],
    });
    expect(text).toContain("Open decisions");
    expect(text).toContain("Approve the project charter");
    expect(text).toContain("Needed by");
  });

  it("never prints probability, impact or internal scores for risks", () => {
    const text = render(FULL);
    expect(text).not.toContain("Probability");
    expect(text).not.toContain("Impact");
  });

  it("hides empty sections and says so plainly for the gauges", () => {
    const text = render(SPARSE);
    expect(text).not.toContain("What we are watching");
    expect(text).not.toContain("Open decisions");
    expect(text).not.toContain("Milestones");
    expect(text).toContain("No tasks yet");
    expect(text).toContain("No budget set yet");
  });
});
