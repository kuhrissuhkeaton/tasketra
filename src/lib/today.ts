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

/**
 * v174: which project the Today "Jump back in" card points at -- the most
 * recently active open project. When no open project has recorded activity
 * yet, the fallback is the member's FIRST project (earliest created), not
 * the newest: the card is a way back to where work started, and a brand-new
 * empty project must not outrank one with real activity just because it was
 * created later. Returns null when there are no open projects.
 */
export function pickJumpProject<T extends { created_at: string; last_activity_at?: string | null; closed_at?: string | null }>(projects: T[]): T | null {
  const open = projects.filter((p) => !p.closed_at);
  if (!open.length) return null;
  const active = open.filter((p) => p.last_activity_at);
  if (active.length) {
    return [...active].sort((a, b) => (a.last_activity_at! < b.last_activity_at! ? 1 : a.last_activity_at! > b.last_activity_at! ? -1 : 0))[0];
  }
  return [...open].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))[0];
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

/** v163, Egg 5: working after 10 PM local earns the wrap-up note a line. */
export function isAfterHours(now: Date): boolean {
  return now.getHours() >= 22;
}

/**
 * v163, Egg 4 (Weekend mode): Friday at or after 3 PM local, with nothing
 * still open that is due before Monday -- overdue work counts as due, and
 * so does anything dated over the weekend; undated work has no due date
 * to break the line. The page additionally requires some sign of a week
 * actually worked (tasks on the list, or something closed today) so an
 * empty account doesn't get told its weekend started.
 */
export function weekendMode(now: Date, tasks: TodayTask[]): boolean {
  if (now.getDay() !== 5 || now.getHours() < 15) return false;
  const mondayKey = addDays(localDateKey(now), 3);
  return !tasks.some((t) => t.status !== "done" && !!t.due_date && t.due_date < mondayKey);
}
