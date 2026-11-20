// @vitest-environment jsdom
//
// v171 calm home: the light project's front page. One primary action,
// plain-words progress, three quiet cards, grow-in-place.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const calls = { listTasks: vi.fn(), listDecisions: vi.fn(), createTask: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listTasks: (...a: unknown[]) => calls.listTasks(...a),
      listDecisions: (...a: unknown[]) => calls.listDecisions(...a),
      createTask: (...a: unknown[]) => calls.createTask(...a),
    },
  };
});

import CalmHome from "../components/CalmHome";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  calls.listTasks.mockResolvedValue({ tasks: [] });
  calls.listDecisions.mockResolvedValue({ decisions: [] });
  calls.createTask.mockResolvedValue({ task: { id: "t9" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

async function render(extra: Partial<React.ComponentProps<typeof CalmHome>> = {}) {
  const props: React.ComponentProps<typeof CalmHome> = {
    projectId: "p1",
    isOwner: true,
    size: "light",
    extraTabs: [],
    onOpenTab: vi.fn(),
    onShowAllTabs: vi.fn(),
    onGrowTab: vi.fn(),
    ...extra,
  };
  await act(async () => { root.render(<CalmHome {...props} />); });
  await flush();
  return props;
}

describe("CalmHome", () => {
  it("an empty project leads with adding the first task, and adding works", async () => {
    const props = await render();
    expect(container.querySelector("h2")?.textContent).toBe("Add your first task");
    expect(container.textContent).toContain("Nothing yet");
    expect(container.textContent).toContain("Nothing scheduled yet");
    expect(container.textContent).toContain("Nothing waiting");
    const input = container.querySelector('input[aria-label="Task title"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "Design homepage layout");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Add").click(); });
    await flush();
    expect(calls.createTask).toHaveBeenCalledWith("p1", "Design homepage layout");
    expect(props.onOpenTab).not.toHaveBeenCalled();
  });

  it("progress is plain words, and the cards open their tabs", async () => {
    calls.listTasks.mockResolvedValue({
      tasks: [
        { id: "t1", title: "Done one", description: null, status: "done", owner_name: null, start_date: null, due_date: null, stakeholder_id: null, parent_task_id: null, roadmap_item_id: null },
        { id: "t2", title: "Next up", description: null, status: "not_started", owner_name: null, start_date: null, due_date: "2026-12-01", stakeholder_id: null, parent_task_id: null, roadmap_item_id: null },
      ],
    });
    calls.listDecisions.mockResolvedValue({
      decisions: [
        { id: "d1", title: "Pick a vendor", context: null, options: [], deadline: null, public_token: "x", status: "open", created_at: "", chosen_option: null, responder_name: null, responded_at: null, outcome_confirmed_at: null },
      ],
    });
    const props = await render();
    expect(container.textContent).toContain("1 of 2 done");
    expect(container.textContent).toContain("Next up");
    expect(container.textContent).toContain("1 waiting");
    expect(container.textContent).toContain("Pick a vendor");
    const tiles = [...container.querySelectorAll(".calm-tile")] as HTMLButtonElement[];
    await act(async () => { tiles[2].click(); });
    expect(props.onOpenTab).toHaveBeenCalledWith("decisions");
  });

  it("grow chips: a hidden piece grows in place, a visible one just opens", async () => {
    const props = await render();
    await act(async () => { button("+ Budget").click(); });
    expect(props.onGrowTab).toHaveBeenCalledWith("budget");
    await act(async () => { button("+ Timeline").click(); });
    expect(props.onOpenTab).toHaveBeenCalledWith("roadmap");
    // A piece already grown back just opens.
    const props2 = await render({ extraTabs: ["budget"] });
    await act(async () => { button("+ Budget").click(); });
    expect(props2.onGrowTab).not.toHaveBeenCalled();
    expect(props2.onOpenTab).toHaveBeenCalledWith("budget");
  });

  it("while loading it never claims the project is empty", async () => {
    calls.listTasks.mockReturnValue(new Promise(() => {}));
    calls.listDecisions.mockReturnValue(new Promise(() => {}));
    await render();
    expect(container.querySelector("h2")?.textContent).toBe("Add a task");
    expect(container.textContent).not.toContain("Add your first task");
    expect(container.textContent).not.toContain("Add your first one above");
    expect(container.textContent).not.toContain("Nothing yet");
    expect(container.textContent).not.toContain("Nothing scheduled yet");
    expect(container.textContent).not.toContain("Nothing waiting");
  });

  it("All project tools shows for the owner only", async () => {
    const props = await render();
    await act(async () => { button("All project tools").click(); });
    expect(props.onShowAllTabs).toHaveBeenCalled();
    await render({ isOwner: false });
    expect(button("All project tools")).toBeUndefined();
  });
});
