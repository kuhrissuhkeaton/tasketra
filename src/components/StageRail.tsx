import { useEffect, useRef, useState } from "react";
import { api, type ProjectStage, type StageData, type StageGate } from "../lib/api";

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
  const [gate, setGate] = useState<StageGate | null>(null);
  const [gateOffer, setGateOffer] = useState<{ from: ProjectStage; to: ProjectStage } | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function load() {
    api.getStage(projectId).then((d) => {
      setData(d);
      if (d.gatesEnabled) api.getStageGate(projectId).then(({ gate }) => setGate(gate)).catch(() => {});
      else setGate(null);
    }).catch(() => setError("Couldn't load stage guidance."));
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
      const from = data?.stage;
      const forward = from ? STAGES.findIndex((s) => s.id === stage) > STAGES.findIndex((s) => s.id === from) : false;
      setPending(null);
      setMenuOpen(false);
      setGateOffer(data?.gatesEnabled && from && forward ? { from, to: stage } : null);
      onStageChange(stage);
      load();
    } catch {
      setError("Couldn't change the stage. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function askGate() {
    if (!gateOffer) return;
    setGateBusy(true);
    setError("");
    try {
      const { gate } = await api.requestStageGate(projectId, gateOffer.from, gateOffer.to);
      setGate(gate);
      setGateOffer(null);
    } catch {
      setError("Couldn't send the approval request. Try again.");
    } finally {
      setGateBusy(false);
    }
  }

  function copyGateLink(token: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/d/${token}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
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

  // Checklist groups. Recommended next = the first unfinished item (the one lime button);
  // Outstanding = the other unfinished items; Completed = done items (collapsed).
  // Blocked only appears when a sponsor sign-off is actually pending or has asked for changes.
  const openList = data.checklist.items.filter((it) => it.status !== "done");
  const doneList = data.checklist.items.filter((it) => it.status === "done");
  const recommended = openList[0] ?? null;
  const outstanding = openList.slice(1);
  const blockedByGate = !!gate && !gateOffer && (gate.status === "pending" || gate.status === "changes_requested");

  function renderItem(item: StageData["checklist"]["items"][number], kind: "primary" | "ghost" | "link") {
    return (
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
          className={kind === "link" ? "stage-item-link" : kind === "primary" ? "btn btn-primary stage-item-cta" : "btn btn-ghost stage-item-cta"}
          onClick={() => onOpenTab(item.tab)}
        >
          {item.action}
        </button>
      </li>
    );
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
              <button type="button" className={openItems === 0 ? "btn btn-primary" : "btn btn-ghost"} onClick={() => requestMove(nextStage)} disabled={saving}>
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

      <div className={data.band.state === "escalate" ? "stage-band stage-band-escalate" : data.band.state === "attention" ? "stage-band stage-band-attention" : "stage-band"} role={data.band.state === "escalate" ? "alert" : undefined}>
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
      {gateOffer && (
        <div className="stage-pending" role="status">
          <p>Want your sponsor to sign off on moving from {STAGE_LABEL[gateOffer.from]} to {STAGE_LABEL[gateOffer.to]}? This is optional and nothing waits on it.</p>
          <div className="stage-pending-actions">
            <button type="button" className="btn btn-primary" onClick={askGate} disabled={gateBusy}>{gateBusy ? "Sending..." : "Request approval"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setGateOffer(null)}>Skip</button>
          </div>
        </div>
      )}
      {gate && !gateOffer && gate.status === "approved" && (
        <div className="stage-gate-status">
          <span className={`charter-dot charter-dot-${gate.status}`} aria-hidden="true" />
          <span>
            {STAGE_LABEL[gate.from]} to {STAGE_LABEL[gate.to]}: approved by {gate.responderName}
          </span>
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
        {recommended && (
          <>
            <h3 className="stage-group-label">Recommended next</h3>
            <ul className="stage-list">{renderItem(recommended, "primary")}</ul>
          </>
        )}
        {blockedByGate && gate && (
          <>
            <h3 className="stage-group-label">Blocked</h3>
            <div className="stage-gate-status">
              <span className={`charter-dot charter-dot-${gate.status}`} aria-hidden="true" />
              <span>
                {STAGE_LABEL[gate.from]} to {STAGE_LABEL[gate.to]}:{" "}
                {gate.status === "pending" && "waiting on your sponsor"}
                {gate.status === "changes_requested" && `${gate.responderName} asked for changes`}
              </span>
              {gate.status === "pending" && isOwner && (
                <button type="button" className="btn btn-ghost" onClick={() => copyGateLink(gate.publicToken)}>{copied ? "Copied" : "Copy link"}</button>
              )}
            </div>
          </>
        )}
        {outstanding.length > 0 && (
          <>
            <h3 className="stage-group-label">Outstanding</h3>
            <ul className="stage-list">{outstanding.map((it) => renderItem(it, "ghost"))}</ul>
          </>
        )}
        {doneList.length > 0 && (
          <>
            <button
              type="button"
              className="btn-link stage-done-toggle"
              aria-expanded={showDone}
              aria-controls="stage-done-list"
              onClick={() => setShowDone((o) => !o)}
            >
              Completed ({doneList.length}) <span aria-hidden="true">{showDone ? "▴" : "▾"}</span>
            </button>
            <ul id="stage-done-list" className="stage-list" hidden={!showDone}>{doneList.map((it) => renderItem(it, "link"))}</ul>
          </>
        )}
        {data.checklist.optionalNote && <p className="stage-next-note">{data.checklist.optionalNote}</p>}
      </div>
    </section>
  );
}
