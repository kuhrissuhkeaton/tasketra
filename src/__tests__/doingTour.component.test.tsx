// @vitest-environment jsdom
//
// v161 (F-09): the DoingTour card. Steps complete from the project's real
// counts (mocked here at the api seam), never from clicking through: the
// baseline is whatever the project already holds when the tour first
// looks, so seeded content alone ticks nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { DoingTour } from "../components/DoingTour";
import { readDoingTour, startDoingTour } from "../lib/doingTour";
import { noteProjectChanged } from "../lib/firstRun";
import { readGettingStarted } from "../lib/gettingStarted";

const counts = { tasks: 7, decisions: 0, checkins: 0 };

vi.mock("../lib/api", () => ({
  api: {
    listTasks: async () => ({ tasks: Array.from({ length: counts.tasks }, (_, i) => ({ id: `t${i}` })) }),
    listDecisions: async () => ({ decisions: Array.from({ length: counts.decisions }, (_, i) => ({ id: `d${i}` })) }),
    getFeed: async () => ({
      feed: Array.from({ length: counts.checkins }, (_, i) => ({ type: "status_update", id: `c${i}` })),
    }),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {});
}

async function renderTour() {
  await act(async () => {
    root.render(<DoingTour userId="u1" projectId="p1" onOpenTab={() => {}} />);
  });
  await flush();
}

beforeEach(() => {
  window.localStorage.clear();
  counts.tasks = 7;
  counts.decisions = 0;
  counts.checkins = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DoingTour", () => {
  it("renders nothing without a tour record", async () => {
    await renderTour();
    expect(container.querySelector(".doing-tour")).toBeNull();
  });

  it("seeded counts alone complete nothing; the first step is current", async () => {
    startDoingTour("u1", "p1");
    await renderTour();
    expect(container.querySelector(".doing-tour")).toBeTruthy();
    expect(container.textContent).toContain("0 of 3");
    const items = [...container.querySelectorAll(".first-run-steps li")];
    expect(items[0].className).toContain("current");
    expect(items[0].textContent).toContain("Add a task");
    expect(container.querySelectorAll(".first-run-steps li.done").length).toBe(0);
    // The baseline was captured from the seeded project.
    expect(readDoingTour("u1", "p1")?.baseline).toEqual({ tasks: 7, decisions: 0, checkins: 0 });
  });

  it("a real new task ticks step 1 and latches the Today checklist too", async () => {
    startDoingTour("u1", "p1");
    await renderTour();
    counts.tasks = 8;
    await act(async () => {
      noteProjectChanged("p1");
    });
    await flush();
    const items = [...container.querySelectorAll(".first-run-steps li")];
    expect(items[0].className).toContain("done");
    expect(items[1].className).toContain("current");
    expect(container.textContent).toContain("1 of 3");
    expect(readDoingTour("u1", "p1")?.taskDone).toBe(true);
    expect(readGettingStarted("u1").task).toBe(true);
  });

  it("completing all three steps shows the wrap-up line", async () => {
    startDoingTour("u1", "p1");
    await renderTour();
    counts.tasks = 8;
    counts.decisions = 1;
    counts.checkins = 1;
    await act(async () => {
      noteProjectChanged("p1");
    });
    await flush();
    expect(container.textContent).toContain("That's the whole loop");
    expect(readGettingStarted("u1")).toMatchObject({ task: true, decision: true, checkin: true });
  });

  it("dismiss hides the card and persists", async () => {
    startDoingTour("u1", "p1");
    await renderTour();
    await act(async () => {
      (container.querySelector('button[aria-label="Dismiss the hands-on steps"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector(".doing-tour")).toBeNull();
    expect(readDoingTour("u1", "p1")?.dismissed).toBe(true);
  });
});
