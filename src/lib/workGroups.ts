// Structural shapes, not the api.ts types: this module is imported by
// the Netlify functions too (the snapshot payload builder), and the
// functions project must stay free of the client api module. The real
// Task and RoadmapItem types are structurally compatible.
export type GroupableTask = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  parent_task_id: string | null;
};
export type WindowItem = { start_date: string | null; end_date: string | null };

/** Whole days from one YYYY-MM-DD key to another (UTC, DST-proof).
 *  Mirrors calendarItems.daysBetween; kept local so this module has no
 *  imports at all. */
export function daysBetween(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Work grouping and planned-window math, shared by the Project Cockpit
// (v165) and the Client Snapshot payload builder (v168) so the two
// surfaces can never disagree about how a project's work breaks down
// or how much of its planned span has elapsed. Extracted from
// ProjectCockpit.tsx in v168; the component re-exports both functions.

export type WorkGroup = { label: string; total: number; done: number };

const TITLE_LEAF = /^(\d{1,2})\.(\d{1,3})\s+(.+)$/;
const TITLE_BARE = /^(\d{1,2})\s+(.+)$/;

/** Tasks grouped into phases, from the strongest structure the data
 *  actually carries, in this order:
 *    1. WBS parents — the top-level ancestor task is the phase (the
 *       phase task counts toward its own group, matching taskStats).
 *    2. WBS numbers in the task titles ("1.1 Initiation", "2.3 Permits",
 *       a bare "8 Commissioning") — how plans built outside the app, or
 *       pasted from a plan document, carry their phases. Guarded: at
 *       least 3 numbered tasks, at least 60% of the list numbered, at
 *       least 2 distinct phase numbers, and the number is at most two
 *       digits so a year ("2026 …") can never become a phase. A group
 *       is labelled "Phase N", or with the bare task's own name when
 *       one provides it. Unnumbered tasks land in a final "Unnumbered"
 *       group so the segments always sum to the whole list.
 *    3. Status — the honest fallback for a flat, unnumbered list.
 */
export function workGroups(tasks: GroupableTask[]): { groups: WorkGroup[]; byStatus: boolean } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const hasParents = tasks.some((t) => t.parent_task_id && byId.has(t.parent_task_id));
  if (!hasParents) {
    type Hit = { major: number; bareName?: string; task: GroupableTask };
    const hits: Hit[] = [];
    for (const t of tasks) {
      const leaf = t.title.match(TITLE_LEAF);
      if (leaf) { hits.push({ major: Number(leaf[1]), task: t }); continue; }
      const bare = t.title.match(TITLE_BARE);
      if (bare) hits.push({ major: Number(bare[1]), bareName: bare[2].trim(), task: t });
    }
    const majors = new Set(hits.map((h) => h.major));
    if (hits.length >= 3 && hits.length / tasks.length >= 0.6 && majors.size >= 2) {
      const hitIds = new Set(hits.map((h) => h.task.id));
      const map = new Map<number, WorkGroup & { bareName?: string }>();
      for (const h of hits) {
        const g = map.get(h.major) ?? { label: `Phase ${h.major}`, total: 0, done: 0 };
        g.total += 1;
        if (h.task.status === "done") g.done += 1;
        if (h.bareName) g.bareName = h.bareName;
        map.set(h.major, g);
      }
      const groups: WorkGroup[] = [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, g]) => ({ label: g.bareName ?? g.label, total: g.total, done: g.done }));
      const rest = tasks.filter((t) => !hitIds.has(t.id));
      if (rest.length > 0) {
        groups.push({ label: "Unnumbered", total: rest.length, done: rest.filter((t) => t.status === "done").length });
      }
      return { groups, byStatus: false };
    }
  }
  if (!hasParents) {
    const order: { status: GroupableTask["status"]; label: string }[] = [
      { status: "in_progress", label: "In progress" },
      { status: "not_started", label: "Not started" },
      { status: "blocked", label: "Blocked" },
      { status: "done", label: "Done" },
    ];
    const groups = order
      .map(({ status, label }) => {
        const count = tasks.filter((t) => t.status === status).length;
        // In status mode the done count only means anything on the Done
        // row itself (where it equals the row's total).
        return { label, total: count, done: status === "done" ? count : 0 };
      })
      .filter((g) => g.total > 0);
    return { groups, byStatus: true };
  }
  const rootOf = (t: GroupableTask): GroupableTask => {
    let cur = t;
    const seen = new Set<string>();
    while (cur.parent_task_id && byId.has(cur.parent_task_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_task_id)!;
    }
    return cur;
  };
  const map = new Map<string, WorkGroup>();
  for (const t of tasks) {
    const root = rootOf(t);
    const g = map.get(root.id) ?? { label: root.title, total: 0, done: 0 };
    g.total += 1;
    if (t.status === "done") g.done += 1;
    map.set(root.id, g);
  }
  const groups = [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return { groups, byStatus: false };
}

/** The planned window, mirroring portfolio.mts: earliest roadmap
 *  start (falling back to its end) to latest end (falling back to its
 *  start). Null when no roadmap item carries a date. */
export function plannedWindow(items: WindowItem[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const i of items) {
    const s = (i.start_date ?? i.end_date)?.slice(0, 10);
    const e = (i.end_date ?? i.start_date)?.slice(0, 10);
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
  }
  if (!start || !end || daysBetween(start, end) <= 0) return null;
  return { start, end };
}
