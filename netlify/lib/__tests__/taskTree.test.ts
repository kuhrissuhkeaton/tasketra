import { describe, it, expect } from "vitest";
import { findDescendantIds, type TaskNode } from "../taskTree.ts";

describe("findDescendantIds", () => {
  it("returns an empty set for a task with no children", () => {
    const tasks: TaskNode[] = [{ id: "a", parent_task_id: null }];
    expect(findDescendantIds(tasks, "a")).toEqual(new Set());
  });

  it("finds a single direct child", () => {
    const tasks: TaskNode[] = [
      { id: "a", parent_task_id: null },
      { id: "b", parent_task_id: "a" },
    ];
    expect(findDescendantIds(tasks, "a")).toEqual(new Set(["b"]));
  });

  it("finds all descendants down a deep chain", () => {
    const tasks: TaskNode[] = [
      { id: "a", parent_task_id: null },
      { id: "b", parent_task_id: "a" },
      { id: "c", parent_task_id: "b" },
      { id: "d", parent_task_id: "c" },
    ];
    expect(findDescendantIds(tasks, "a")).toEqual(new Set(["b", "c", "d"]));
    // A middle node's descendants are just the nodes below it, not above.
    expect(findDescendantIds(tasks, "b")).toEqual(new Set(["c", "d"]));
    // A leaf has no descendants.
    expect(findDescendantIds(tasks, "d")).toEqual(new Set());
  });

  it("finds all descendants across multiple sibling branches", () => {
    const tasks: TaskNode[] = [
      { id: "a", parent_task_id: null },
      { id: "b1", parent_task_id: "a" },
      { id: "b2", parent_task_id: "a" },
      { id: "c1", parent_task_id: "b1" },
      { id: "c2", parent_task_id: "b2" },
    ];
    expect(findDescendantIds(tasks, "a")).toEqual(new Set(["b1", "b2", "c1", "c2"]));
    expect(findDescendantIds(tasks, "b1")).toEqual(new Set(["c1"]));
  });

  it("ignores unrelated tasks elsewhere in the project", () => {
    const tasks: TaskNode[] = [
      { id: "a", parent_task_id: null },
      { id: "b", parent_task_id: "a" },
      { id: "x", parent_task_id: null },
      { id: "y", parent_task_id: "x" },
    ];
    expect(findDescendantIds(tasks, "a")).toEqual(new Set(["b"]));
  });

  it("terminates instead of looping forever on malformed cyclic input", () => {
    // This should never occur in practice -- the reparent endpoint blocks it --
    // but the function must not hang if it ever did. On a genuine cycle, the
    // root can legitimately loop back into its own result set; the guarantee
    // that actually matters here is that this returns at all instead of
    // recursing forever, which the surrounding test timeout would catch.
    const tasks: TaskNode[] = [
      { id: "a", parent_task_id: "c" },
      { id: "b", parent_task_id: "a" },
      { id: "c", parent_task_id: "b" },
    ];
    const result = findDescendantIds(tasks, "a");
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns an empty set when the root id doesn't exist in the list", () => {
    const tasks: TaskNode[] = [{ id: "a", parent_task_id: null }];
    expect(findDescendantIds(tasks, "nonexistent")).toEqual(new Set());
  });
});
