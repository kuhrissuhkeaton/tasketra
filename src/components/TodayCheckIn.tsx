import { useState } from "react";
import { api, type PortfolioProjectSummary } from "../lib/api";
import { announce } from "../lib/announce";
import { STATED_HEALTH_LABEL, STATED_HEALTH_PILL, STATED_HEALTH_VALUES, type StatedHealth } from "../lib/statusEvidence";

/**
 * The per-project check-in composer on Today (v159, F-15): the headline
 * habit no longer lives only behind a project's Feed toggle. Collapsed to
 * one link per project in the "Projects at a glance" rail; expanding it
 * offers the same composer contract as the project Feed -- the evidence
 * health pre-selected as the suggestion, a line of text, Post -- through
 * the same /api/status-updates call. Posting refreshes the rail so the
 * project's pill immediately wears the status just stated.
 */
export function TodayCheckIn({ project, onPosted }: { project: PortfolioProjectSummary; onPosted: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<StatedHealth | null>(project.health);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  function pickPill(h: StatedHealth) {
    setSelected((cur) => (cur === h ? null : h));
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if ((!text && !selected) || posting) return;
    setPosting(true);
    setError("");
    try {
      await api.createStatusUpdate(project.id, text, selected ?? undefined);
      announce(`Check-in posted for ${project.name}`);
      setNote("");
      setOpen(false);
      onPosted();
    } catch {
      setError("Couldn't post that check-in. Try again.");
    } finally {
      setPosting(false);
    }
  }

  if (!open) {
    return (
      <div className="today-checkin">
        <button type="button" className="btn-link today-checkin-toggle" aria-expanded={false} onClick={() => setOpen(true)}>
          Post a check-in
        </button>
      </div>
    );
  }

  return (
    <form className="today-checkin today-checkin-open" onSubmit={post}>
      <div className="status-pill-row" role="group" aria-label={`Check-in status for ${project.name}`}>
        {STATED_HEALTH_VALUES.map((h) => (
          <button
            key={h}
            type="button"
            className={`pill status-pill ${STATED_HEALTH_PILL[h]}${selected === h ? " status-pill-on" : ""}`}
            aria-pressed={selected === h}
            onClick={() => pickPill(h)}
          >
            {STATED_HEALTH_LABEL[h]}
            {project.health === h && <span className="status-pill-suggested">suggested</span>}
          </button>
        ))}
      </div>
      <div className="inline-form feed-composer-form">
        <input
          aria-label={`Check-in for ${project.name}`}
          placeholder="How is the project going?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" disabled={posting || (!note.trim() && !selected)}>{posting ? "Posting…" : "Post"}</button>
        <button type="button" className="btn btn-ghost" disabled={posting} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
