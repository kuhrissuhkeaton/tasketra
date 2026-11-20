// v171: the calm home a light project opens on, instead of the full tabbed
// ProjectHome wall. One primary action (add a task), progress in plain
// words, three quiet cards, and a grow-in-place row: the heavier pieces
// are one tap away and are added to this same project, in place -- the
// size system only ever hid them; nothing was deleted (see projectView.ts).
//
// Data comes from the same list endpoints the tabs use; this component
// owns no state beyond what it renders.

import { useEffect, useState } from "react";
import { api, type Decision, type Task } from "../lib/api";
import { fmtDate } from "../lib/format";
import { hiddenTabIds, type ProjectSize } from "../lib/projectView";

// The pieces offered on the grow row, in the order a growing project
// usually reaches for them. Timeline (roadmap) is not hidden by size, but
// it belongs here: on the calm home it is the one core surface with no
// card of its own.
const GROW_PIECES: { id: string; label: string }[] = [
  { id: "roadmap", label: "Timeline" },
  { id: "budget", label: "Budget" },
  { id: "meetings", label: "Meetings" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "risks", label: "Risks" },
  { id: "charter", label: "Charter" },
  { id: "assumptions", label: "Assumptions" },
  { id: "dependencies", label: "Dependencies" },
  { id: "procurement", label: "Vendors" },
];

export default function CalmHome({
  projectId,
  isOwner,
  size,
  extraTabs,
  onOpenTab,
  onShowAllTabs,
  onGrowTab,
}: {
  projectId: string;
  isOwner: boolean;
  size: ProjectSize;
  extraTabs: string[];
  onOpenTab: (tab: string) => void;
  onShowAllTabs: () => void;
  onGrowTab: (tab: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [t, d] = await Promise.all([api.listTasks(projectId), api.listDecisions(projectId)]);
    setTasks(t.tasks);
    setDecisions(d.decisions);
  }

  useEffect(() => {
    let live = true;
    Promise.all([api.listTasks(projectId), api.listDecisions(projectId)])
      .then(([t, d]) => {
        if (!live) return;
        setTasks(t.tasks);
        setDecisions(d.decisions);
      })
      .catch(() => {
        if (!live) return;
        setTasks([]);
        setDecisions([]);
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.createTask(projectId, trimmed);
      setTitle("");
      await load();
    } catch {
      setError("That task didn't save. Give it another try.");
    } finally {
      setAdding(false);
    }
  }

  const total = tasks?.length ?? 0;
  const done = tasks?.filter((t) => t.status === "done").length ?? 0;
  const open = total - done;
  const nextDue = (tasks ?? [])
    .filter((t) => t.status !== "done" && t.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
  const waiting = (decisions ?? []).filter((d) => d.status === "open");
  const nextDecision = [...waiting].sort((a, b) =>
    (a.deadline ?? "9999") < (b.deadline ?? "9999") ? -1 : 1,
  )[0];

  const hidden = hiddenTabIds(size);
  function grow(id: string) {
    // A piece the size view hides is grown back in place (and then opened);
    // a piece that was never hidden just opens.
    if (hidden.includes(id) && !extraTabs.includes(id)) onGrowTab(id);
    else onOpenTab(id);
  }

  return (
    <div className="calm">
      <section className="calm-add">
        <h2 className="calm-add-title">{total === 0 ? "Add your first task" : "Add a task"}</h2>
        <p className="calm-add-sub">
          {tasks === null
            ? "One moment…"
            : total === 0
              ? "Get started by creating your first task for this project."
              : `${done} of ${total} done${open > 0 ? `, ${open} still open` : ""}. What's next?`}
        </p>
        <form className="calm-add-form" onSubmit={addTask}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Design homepage layout"
            aria-label="Task title"
          />
          <button type="submit" className="btn btn-primary" disabled={adding || !title.trim()}>
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <div className="calm-grid">
        <button type="button" className="calm-tile" onClick={() => onOpenTab("tasks")}>
          <span className="calm-tile-name">Tasks</span>
          <span className="calm-tile-line">
            {tasks === null ? "…" : total === 0 ? "Nothing yet" : `${done} of ${total} done`}
          </span>
          <span className="calm-tile-line">
            {total === 0 ? "Add your first one above" : open > 0 ? `${open} still open` : "All caught up"}
          </span>
        </button>
        <button type="button" className="calm-tile" onClick={() => onOpenTab("tasks")}>
          <span className="calm-tile-name">Coming up</span>
          {nextDue ? (
            <>
              <span className="calm-tile-line calm-tile-strong">{nextDue.title}</span>
              <span className="calm-tile-line">Due {fmtDate(nextDue.due_date)}</span>
            </>
          ) : (
            <span className="calm-tile-line">Nothing scheduled yet</span>
          )}
        </button>
        <button type="button" className="calm-tile" onClick={() => onOpenTab("decisions")}>
          <span className="calm-tile-name">Waiting on a decision</span>
          {waiting.length > 0 ? (
            <>
              <span className="calm-tile-line">
                {waiting.length} waiting
              </span>
              <span className="calm-tile-line calm-tile-strong">{nextDecision?.title}</span>
            </>
          ) : (
            <span className="calm-tile-line">Nothing waiting</span>
          )}
        </button>
      </div>

      <div className="calm-grow">
        <p className="calm-grow-label">Need more for this project?</p>
        <div className="calm-grow-row">
          {GROW_PIECES.map((piece) => (
            <button key={piece.id} type="button" className="calm-chip" onClick={() => grow(piece.id)}>
              + {piece.label}
            </button>
          ))}
        </div>
        {isOwner && (
          <button type="button" className="btn-link calm-all" onClick={onShowAllTabs}>
            All project tools
          </button>
        )}
      </div>
    </div>
  );
}
