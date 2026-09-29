import { useEffect, useRef, useState } from "react";
import { api, type ProjectStage, type StageData } from "../lib/api";

export const STAGES: { id: ProjectStage; label: string }[] = [
  { id: "initiate", label: "Initiate" },
  { id: "plan", label: "Plan" },
  { id: "execute", label: "Execute" },
  { id: "close", label: "Close" },
];

export const STAGE_LABEL: Record<ProjectStage, string> = {
  initiate: "Initiate",
  plan: "Plan",
  execute: "Execute",
  close: "Close",
};

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 6.5l2.4 2.4L9.5 3.6" />
  </svg>
);

/** Small "Stage: Plan" chip shown in the page header on every project tab. */
export function StageChip({ stage, small }: { stage: ProjectStage | undefined; small?: boolean }) {
  if (!stage) return null;
  return (
    <span className={small ? "stage-chip stage-chip-sm" : "stage-chip"}>
      <span className="stage-chip-dot" aria-hidden="true" />
      {small ? STAGE_LABEL[stage] : `Stage: ${STAGE_LABEL[stage]}`}
    </span>
  );
}

/**
 * The stage rail and "Next up" panel at the top of a project's Home tab.
 * Stage is a state the owner can move in either direction; nothing here ever
 * blocks a change. The checklist is derived from what already exists in the
 * project (see netlify/lib/stageChecklist.ts), so there are no separate
 * checkboxes to tick.
 */
export function StageRail({
  projectId,
  isOwner,
  onStageChange,
  onOpenTab,
}: {
  projectId: string;
  isOwner: boolean;
  onStageChange: (stage: ProjectStage) => void;
  onOpenTab: (tab: string) => void;
}) {
  const [data, setData] = useState<StageData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<ProjectStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  function load() {
    api.getStage(projectId).then(setData).catch(() => setError("Couldn't load stage guidance."));
  }

  useEffect(() => {
    load();
  }, [projectId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!data) {
    return error ? null : <div className="stage-rail stage-rail-loading skel-loading-block"><div className="skel skel-text" style={{ width: "50%" }} /><div className="skel skel-text" style={{ width: "80%", marginBottom: 0 }} /></div>;
  }

  const currentIndex = STAGES.findIndex((s) => s.id === data.stage);
  const nextStage = STAGES[currentIndex + 1]?.id ?? null;
  const openItems = data.checklist.total - data.checklist.done;

  async function commit(stage: ProjectStage) {
    setSaving(true);
    setError("");
    try {
      await api.updateProject(projectId, { stage });
      setPending(null);
      setMenuOpen(false);
      onStageChange(stage);
      load();
    } catch {
      setError("Couldn't change the stage. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function requestMove(stage: ProjectStage) {
    setMenuOpen(false);
    const movingForward = STAGES.findIndex((s) => s.id === stage) > currentIndex;
    if (movingForward && openItems > 0) {
      setPending(stage);
      return;
    }
    commit(stage);
  }

  return (
    <section className="stage-rail" aria-label="Project stage">
      <div className="stage-rail-top">
        <p className="stage-rail-label">Where this project is</p>
        {isOwner && (
          <div className="stage-rail-actions" ref={menuRef}>
            <button type="button" className="btn btn-ghost" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
              Change stage
            </button>
            {nextStage && (
              <button type="button" className="btn btn-primary" onClick={() => requestMove(nextStage)} disabled={saving}>
                Move to {STAGE_LABEL[nextStage]}
              </button>
            )}
            {menuOpen && (
              <div className="stage-menu" role="menu">
                <p className="stage-menu-label">Currently in {STAGE_LABEL[data.stage]}</p>
                {STAGES.filter((s) => s.id !== data.stage).map((s) => (
                  <button key={s.id} type="button" role="menuitem" className="stage-menu-item" onClick={() => requestMove(s.id)}>
                    {STAGES.findIndex((x) => x.id === s.id) < currentIndex ? "Back to" : s.id === nextStage ? "Move to" : "Jump to"} {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ol className="stage-steps">
        {STAGES.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          return (
            <li key={s.id} className={`stage-step-wrap`}>
              {i > 0 && <span className={i <= currentIndex ? "stage-connector stage-connector-done" : "stage-connector"} aria-hidden="true" />}
              <span className={`stage-step stage-step-${state}`} aria-current={state === "current" ? "step" : undefined}>
                <span className="stage-step-mark" aria-hidden="true">
                  {state === "done" ? <CheckIcon /> : i + 1}
                </span>
                <span className="stage-step-name">{s.label}</span>
                {state === "current" && <span className="stage-step-here">You are here</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className={data.band.state === "attention" ? "stage-band stage-band-attention" : "stage-band"}>
        <span className="stage-band-title">Monitor and control</span>
        <span className="stage-band-msg">{data.band.message}</span>
      </div>

      {pending && (
        <div className="stage-pending" role="status">
          <p>
            {openItems === 1 ? "1 suggestion is" : `${openItems} suggestions are`} still open in {STAGE_LABEL[data.stage]}. You can move on anyway and come back later.
          </p>
          <div className="stage-pending-actions">
            <button type="button" className="btn btn-primary" onClick={() => commit(pending)} disabled={saving}>Move anyway</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Finish suggestions</button>
          </div>
        </div>
      )}
      {error && <p className="stage-error" role="alert">{error}</p>}

      <div className="stage-next">
        <div className="stage-next-head">
          <h2>{data.checklist.title}</h2>
          <span className="stage-next-count">{data.checklist.done} of {data.checklist.total} done</span>
        </div>
        <div
          className="stage-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={data.checklist.total}
          aria-valuenow={data.checklist.done}
          aria-label={`${data.checklist.done} of ${data.checklist.total} done`}
        >
          <div className="stage-progress-fill" style={{ width: `${data.checklist.total ? (data.checklist.done / data.checklist.total) * 100 : 0}%` }} />
        </div>
        <ul className="stage-list">
          {data.checklist.items.map((item) => (
            <li key={item.id} className="stage-item">
              <span className={`stage-item-mark stage-item-mark-${item.status}`} aria-hidden="true">
                {item.status === "done" ? <CheckIcon /> : item.status === "partial" ? <span className="stage-item-dot" /> : null}
              </span>
              <div className="stage-item-text">
                <p className="stage-item-title">
                  {item.title}
                  <span className="sr-only">{item.status === "done" ? " (done)" : item.status === "partial" ? " (in progress)" : " (to do)"}</span>
                </p>
                <p className="stage-item-meta">{item.meta}</p>
              </div>
              <button
                type="button"
                className={item.status === "done" ? "stage-item-link" : "btn btn-primary stage-item-cta"}
                onClick={() => onOpenTab(item.tab)}
              >
                {item.action}
              </button>
            </li>
          ))}
        </ul>
        {data.checklist.optionalNote && <p className="stage-next-note">{data.checklist.optionalNote}</p>}
      </div>
    </section>
  );
}
