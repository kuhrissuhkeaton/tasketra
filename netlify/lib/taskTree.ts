export type TaskNode = { id: string; parent_task_id: string | null };

/**
 * Returns the set of all descendant ids of `rootId` within `tasks` (children,
 * grandchildren, etc). Used to (a) block reparenting a task under its own
 * descendant, and (b) cascade a soft-delete down a whole sub-tree.
 *
 * Defensive against malformed/cyclic input (a `result.has` guard prevents
 * infinite loops even if bad data ever existed) -- this is exactly the
 * property the reparent cycle-check exists to guarantee never happens, so
 * this function should never actually need it in practice.
 */
export function findDescendantIds(tasks: TaskNode[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parent_task_id) {
      const list = childrenByParent.get(t.parent_task_id) || [];
      list.push(t.id);
      childrenByParent.set(t.parent_task_id, list);
    }
  }

  const result = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const childId of childrenByParent.get(id) || []) stack.push(childId);
  }
  return result;
}
