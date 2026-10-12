// Pure logic for the Today screen: who a task is "mine" for, which bucket it
// falls in, and which one task to suggest starting with. Kept out of the page
// so it can be unit tested without rendering anything.

export type TodayTask = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  owner_name: string | null;
  due_date: string | null; // YYYY-MM-DD
  project_id: string;
  project_name: string;
  project_stage: string;
};

export type TodayBuckets = {
  overdue: TodayTask[];
  today: TodayTask[];
  week: TodayTask[];
  later: TodayTask[];
  waiting: TodayTask[];
};

/** YYYY-MM-DD for a Date in the viewer's own timezone. */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return localDateKey(new Date(y, m - 1, d + n));
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * "Mine and unassigned": the owner field is free text, so a task counts as the
 * viewer's when it has no owner, or the owner matches their display name, their
 * full email, or the part of their email before the @.
 */
export function isMineOrUnassigned(task: Pick<TodayTask, "owner_name">, user: { email: string; display_name?: string | null }): boolean {
  const owner = (task.owner_name ?? "").trim();
  if (!owner) return true;
  const o = norm(owner);
  const names = [user.display_name ?? "", user.email, user.email.split("@")[0]].map(norm).filter(Boolean);
  if (names.includes(o)) return true;
  // First name only ("Karissa") also counts when it is the display name's first word.
  const first = norm((user.display_name ?? "").split(/\s+/)[0] ?? "");
  return first.length > 0 && o === first;
}

/** Sort and bucket open tasks against the viewer's local "today" key. */
export function bucketTasks(tasks: TodayTask[], todayKey: string): TodayBuckets {
  const weekEnd = addDays(todayKey, 7);
  const out: TodayBuckets = { overdue: [], today: [], week: [], later: [], waiting: [] };
  for (const t of tasks) {
    if (t.status === "done") continue;
    if (t.status === "blocked") { out.waiting.push(t); continue; }
    if (!t.due_date) { out.later.push(t); continue; }
    if (t.due_date < todayKey) out.overdue.push(t);
    else if (t.due_date === todayKey) out.today.push(t);
    else if (t.due_date <= weekEnd) out.week.push(t);
    else out.later.push(t);
  }
  const byDue = (a: TodayTask, b: TodayTask) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.title.localeCompare(b.title);
  out.overdue.sort(byDue); out.today.sort(byDue); out.week.sort(byDue); out.later.sort(byDue); out.waiting.sort(byDue);
  return out;
}

/** The one task to suggest: oldest overdue, else first due today, else first blocked. */
export function startHere(b: TodayBuckets): { task: TodayTask; reason: "overdue" | "today" | "blocked" } | null {
  if (b.overdue[0]) return { task: b.overdue[0], reason: "overdue" };
  if (b.today[0]) return { task: b.today[0], reason: "today" };
  if (b.waiting[0]) return { task: b.waiting[0], reason: "blocked" };
  return null;
}

/** How many days past due (1 = yesterday). */
export function daysLate(dueKey: string, todayKey: string): number {
  const [y1, m1, d1] = dueKey.split("-").map(Number);
  const [y2, m2, d2] = todayKey.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** Count tasks finished on the viewer's local calendar day. */
export function closedToday(done: { updated_at: string }[], todayKey: string): number {
  return done.filter((d) => localDateKey(new Date(d.updated_at)) === todayKey).length;
}

export function wrapUpNote(closed: number, movingTomorrow: number, blocked: number): string {
  const parts = [`Closed ${closed} ${closed === 1 ? "item" : "items"} today.`];
  if (movingTomorrow > 0) parts.push(`${movingTomorrow} moving to tomorrow.`);
  if (blocked > 0) parts.push(`${blocked} waiting on others.`);
  return parts.join(" ");
}
