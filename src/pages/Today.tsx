import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type MyTodayData, type PortfolioData, type PortfolioProjectSummary } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useDocumentTitle } from "../lib/documentTitle";
import { announce } from "../lib/announce";
import { fmtDate } from "../lib/format";
import {
  addDays,
  bucketTasks,
  closedToday,
  daysLate,
  greeting,
  isMineOrUnassigned,
  localDateKey,
  startHere,
  wrapUpNote,
  type TodayTask,
} from "../lib/today";

const HEALTH_LABEL: Record<PortfolioProjectSummary["health"], string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};
const HEALTH_PILL: Record<PortfolioProjectSummary["health"], string> = {
  on_track: "pill-green",
  at_risk: "pill-gold",
  off_track: "pill-red",
};

const WEEKDAY_FMT: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" };

export default function Today() {
  useDocumentTitle("Today");
  const { user } = useAuth();
  const [data, setData] = useState<MyTodayData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState(true);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [justDone, setJustDone] = useState<TodayTask[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newProject, setNewProject] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  const now = new Date();
  const todayKey = localDateKey(now);
  const tomorrowKey = addDays(todayKey, 1);

  const load = useCallback(() => {
    api.getMyToday()
      .then((r) => { setData(r); setTasks(r.tasks as TodayTask[]); })
      .catch(() => setError("Couldn't load your tasks. Refresh to try again."));
    api.getPortfolio().then(setPortfolio).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const viewer = useMemo(
    () => ({ email: user?.email ?? "", display_name: user?.display_name ?? null }),
    [user?.email, user?.display_name],
  );

  const visible = useMemo(
    () => (mine ? tasks.filter((t) => isMineOrUnassigned(t, viewer)) : tasks),
    [tasks, mine, viewer],
  );
  const buckets = useMemo(() => bucketTasks(visible, todayKey), [visible, todayKey]);
  const focus = startHere(buckets);

  const projectsForAdd = useMemo(() => {
    if (portfolio?.projects.length) return portfolio.projects.map((p) => ({ id: p.id, name: p.name }));
    const seen = new Map<string, string>();
    tasks.forEach((t) => seen.set(t.project_id, t.project_name));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [portfolio, tasks]);
  useEffect(() => {
    if (!newProject && projectsForAdd[0]) setNewProject(projectsForAdd[0].id);
  }, [projectsForAdd, newProject]);

  const patchLocal = (id: string, patch: Partial<TodayTask>) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function markDone(t: TodayTask) {
    const prev = t.status;
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    setJustDone((d) => [{ ...t, status: "done" }, ...d]);
    try {
      await api.updateTask(t.id, { status: "done" });
      announce(`Marked done: ${t.title}`);
    } catch {
      setJustDone((d) => d.filter((x) => x.id !== t.id));
      setTasks((ts) => [{ ...t, status: prev }, ...ts]);
      setError("Couldn't save that change. Try again.");
    }
  }

  async function undoDone(t: TodayTask) {
    setJustDone((d) => d.filter((x) => x.id !== t.id));
    setTasks((ts) => [{ ...t, status: "not_started" }, ...ts]);
    try {
      await api.updateTask(t.id, { status: "not_started" });
      announce(`Reopened: ${t.title}`);
    } catch {
      setError("Couldn't save that change. Try again.");
    }
  }

  async function setDue(t: TodayTask, due: string) {
    if (!due || due === t.due_date) return;
    const prev = t.due_date;
    patchLocal(t.id, { due_date: due });
    try {
      await api.updateTask(t.id, { due_date: due });
      announce(`Due date for ${t.title} set to ${due}`);
    } catch {
      patchLocal(t.id, { due_date: prev });
      setError("Couldn't save that change. Try again.");
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !newProject || adding) return;
    setAdding(true);
    try {
      const { task } = await api.createTask(newProject, title, user?.display_name ?? undefined, todayKey);
      const project = projectsForAdd.find((p) => p.id === newProject);
      setTasks((ts) => [{
        id: task.id, title: task.title, status: task.status, owner_name: task.owner_name,
        due_date: task.due_date ?? todayKey, project_id: newProject, project_name: project?.name ?? "",
        project_stage: portfolio?.projects.find((p) => p.id === newProject)?.stage ?? "",
      }, ...ts]);
      setNewTitle("");
      announce(`Added: ${title}`);
    } catch {
      setError("Couldn't add that task. Try again.");
    } finally {
      setAdding(false);
    }
  }

  async function moveTodayToTomorrow() {
    const moving = buckets.today;
    if (!moving.length) return;
    moving.forEach((t) => patchLocal(t.id, { due_date: tomorrowKey }));
    const results = await Promise.allSettled(moving.map((t) => api.updateTask(t.id, { due_date: tomorrowKey })));
    const failed = moving.filter((_, i) => results[i].status === "rejected");
    if (failed.length) {
      failed.forEach((t) => patchLocal(t.id, { due_date: todayKey }));
      setError(`Couldn't move ${failed.length} ${failed.length === 1 ? "task" : "tasks"}. They're still due today.`);
    } else {
      announce(`Moved ${moving.length} to tomorrow`);
    }
  }

  const closed = closedToday(data?.recentlyDone ?? [], todayKey) + justDone.length;
  const note = wrapUpNote(closed, buckets.today.length, buckets.waiting.length);

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The note is also in a selectable text box below. */
    }
  }

  const firstName = (user?.display_name ?? "").trim().split(/\s+/)[0];
  const openCount = buckets.overdue.length + buckets.today.length + buckets.week.length;
  const loaded = data !== null;
  const noProjects = loaded && portfolio !== null && portfolio.projects.length === 0 && tasks.length === 0;

  function renderRow(t: TodayTask) {
    const late = t.status !== "blocked" && t.due_date && t.due_date < todayKey;
    return (
      <li key={t.id} className="tw-row">
        <button
          type="button"
          className="tw-check"
          aria-label={`Mark done: ${t.title}`}
          aria-pressed="false"
          onClick={() => markDone(t)}
        />
        <div className="tw-row-text">
          <Link to={`/app/projects/${t.project_id}?tab=tasks`} className="tw-row-title">{t.title}</Link>
          <span className="muted tw-row-meta">
            {t.project_name}
            {t.status === "blocked" && " · Blocked"}
            {mine ? "" : t.owner_name ? ` · ${t.owner_name}` : ""}
          </span>
        </div>
        <label className={`tw-date${late ? " late" : ""}`}>
          <span className="sr-only">Due date for {t.title}</span>
          <input
            type="date"
            value={t.due_date ?? ""}
            onChange={(e) => setDue(t, e.target.value)}
          />
          {late && t.due_date && <span className="tw-late">{daysLate(t.due_date, todayKey)}d late</span>}
        </label>
      </li>
    );
  }

  function renderGroup(title: string, items: TodayTask[], hint?: string) {
    if (!items.length) return null;
    const id = `tw-g-${title.replace(/\W+/g, "-").toLowerCase()}`;
    return (
      <section key={title} aria-labelledby={id} className="tw-group">
        <div className="tw-group-head">
          <h3 id={id}>{title} <span className="muted tw-count">{items.length}</span></h3>
          {hint && <span className="muted tw-hint">{hint}</span>}
        </div>
        <ul className="tw-list">{items.map((t) => renderRow(t))}</ul>
      </section>
    );
  }

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main tw-main">
        <div className="page-head">
          <div>
            <h1>{greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="muted tw-sub">
              {noProjects
                ? "Nothing on your plate yet."
                : loaded
                ? `${openCount} open for you · ${buckets.overdue.length} overdue · ${now.toLocaleDateString(undefined, WEEKDAY_FMT)}`
                : "Loading your tasks..."}
            </p>
          </div>
          <div className="page-head-actions">
            {!noProjects && (
              <button type="button" className="btn btn-ghost" aria-expanded={wrapOpen} onClick={() => setWrapOpen((o) => !o)}>
                Wrap up the day
              </button>
            )}
            <Link className="btn btn-ghost" to="/app/projects">All projects</Link>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {noProjects && (
          <div className="tw-empty">
            <h2>Start with the one thing you need to deliver</h2>
            <p className="muted">
              Tasketra sets up only what a first project needs: a purpose, a date and your first tasks.
              Everything else appears when you need it.
            </p>
            <Link className="btn btn-primary" to="/app/projects">Start a project</Link>
          </div>
        )}

        {loaded && !noProjects && (
          <div className="tw-grid">
            <div className="tw-col">
              <div className="tw-toggle" role="group" aria-label="Whose tasks">
                <button type="button" className="btn btn-ghost" aria-pressed={mine} onClick={() => setMine(true)}>Mine and unassigned</button>
                <button type="button" className="btn btn-ghost" aria-pressed={!mine} onClick={() => setMine(false)}>Everyone</button>
              </div>

              {focus ? (
                <section className="tw-focus" aria-label="Start here">
                  <div>
                    <span className="tw-focus-label">Start here</span>
                    <h2>{focus.task.title}</h2>
                    <span className="tw-focus-meta">
                      {focus.task.project_name}
                      {focus.reason === "overdue" && focus.task.due_date && ` · ${daysLate(focus.task.due_date, todayKey)} days late`}
                      {focus.reason === "blocked" && " · Waiting on someone. Can you unblock it?"}
                    </span>
                  </div>
                  <div className="tw-focus-actions">
                    <button type="button" className="btn btn-primary" onClick={() => markDone(focus.task)}>Mark done</button>
                    {focus.reason !== "blocked" && (
                      <button type="button" className="btn tw-focus-ghost" onClick={() => setDue(focus.task, tomorrowKey)}>Move to tomorrow</button>
                    )}
                  </div>
                </section>
              ) : (
                <section className="tw-clear" aria-label="Your day is clear">
                  <h2>Your day is clear</h2>
                  <p className="muted">Nothing is overdue or due today. Plan ahead from This week, or add a task.</p>
                </section>
              )}

              {projectsForAdd.length > 0 && (
                <form className="tw-add" onSubmit={addTask}>
                  <label className="sr-only" htmlFor="tw-add-title">Add a task for today</label>
                  <input
                    id="tw-add-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Add a task for today, press Enter"
                    maxLength={200}
                  />
                  {projectsForAdd.length > 1 && (
                    <>
                      <label className="sr-only" htmlFor="tw-add-project">Project for the new task</label>
                      <select id="tw-add-project" value={newProject} onChange={(e) => setNewProject(e.target.value)}>
                        {projectsForAdd.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </>
                  )}
                  <button type="submit" className="btn btn-ghost" disabled={adding || !newTitle.trim()}>Add</button>
                </form>
              )}

              {wrapOpen && (
                <section className="tw-wrap" aria-label="Wrap up the day">
                  <h2>Wrap up the day</h2>
                  <p>
                    You closed <strong>{closed}</strong>, <strong>{buckets.today.length}</strong> still due today,{" "}
                    <strong>{buckets.waiting.length}</strong> waiting on others.
                  </p>
                  <label htmlFor="tw-note" className="tw-note-label">Status note you can paste anywhere</label>
                  <textarea id="tw-note" readOnly rows={2} value={note} />
                  <div className="tw-wrap-actions">
                    <button type="button" className="btn btn-ghost" onClick={copyNote}>{copied ? "Copied" : "Copy note"}</button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={buckets.today.length === 0}
                      onClick={moveTodayToTomorrow}
                    >
                      Move {buckets.today.length} to tomorrow
                    </button>
                  </div>
                </section>
              )}

              <div className="tw-card">
                {renderGroup("Overdue", buckets.overdue, "oldest first")}
                {renderGroup("Due today", buckets.today)}
                {renderGroup("This week", buckets.week)}
                {openCount === 0 && buckets.later.length === 0 && buckets.waiting.length === 0 && (
                  <p className="muted">No open tasks here.</p>
                )}
                {buckets.later.length > 0 && (
                  <details className="tw-later">
                    <summary>Later or no date ({buckets.later.length})</summary>
                    <ul className="tw-list">{buckets.later.map((t) => renderRow(t))}</ul>
                  </details>
                )}
              </div>

              {buckets.waiting.length > 0 && (
                <div className="tw-card">
                  {renderGroup("Waiting on others", buckets.waiting, "blocked tasks")}
                </div>
              )}

              {justDone.length > 0 && (
                <div className="tw-card" aria-label="Just finished">
                  <h3 className="tw-group-head">Just finished</h3>
                  <ul className="tw-list">
                    {justDone.map((t) => (
                      <li key={t.id} className="tw-row tw-row-done">
                        <span className="tw-check done" aria-hidden="true">{"✓"}</span>
                        <div className="tw-row-text"><span className="tw-row-title">{t.title}</span></div>
                        <button type="button" className="btn-link" onClick={() => undoDone(t)}>Undo</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data?.truncated && <p className="muted tw-hint">Showing the first 400 open tasks.</p>}
            </div>

            {portfolio && portfolio.projects.length > 0 && (
              <aside className="tw-rail" aria-label="Coming up and projects">
                <div className="tw-card">
                  <h3>Coming up</h3>
                  {portfolio.upcomingMilestones.length === 0 ? (
                    <p className="muted tw-hint">No upcoming milestones.</p>
                  ) : (
                    <ul className="tw-list">
                      {portfolio.upcomingMilestones.slice(0, 4).map((m) => (
                        <li key={m.id} className="tw-rail-row">
                          <Link to={`/app/projects/${m.projectId}?tab=roadmap`}>{m.title}</Link>
                          <span className="muted tw-row-meta">{m.projectName} &middot; {fmtDate(m.date)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="tw-card">
                  <h3>Projects at a glance</h3>
                  <ul className="tw-list">
                    {portfolio.projects.map((p) => (
                      <li key={p.id} className="tw-rail-row tw-rail-project">
                        <Link to={`/app/projects/${p.id}`}>{p.name}</Link>
                        <span className={`pill ${HEALTH_PILL[p.health]}`}>{HEALTH_LABEL[p.health]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
