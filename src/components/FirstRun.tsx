import { useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../lib/api";
import { PROJECT_TEMPLATES, type TemplateId } from "../lib/projectTemplates";

/** What the person picked: the example project, a built-in template, or blank. */
export type FirstRunChoice = "example" | TemplateId | "blank";

type Card = { choice: Exclude<FirstRunChoice, "blank">; title: string; blurb: string; badge?: string };

const CARDS: Card[] = [
  {
    choice: "example",
    title: "Start with example data",
    blurb: "A filled-in project with tasks, a roadmap, and an issue, risk, assumption and dependency to click through. Delete anything you don't want.",
    badge: "Fastest. See it working.",
  },
  ...PROJECT_TEMPLATES.map((t) => ({ choice: t.id as TemplateId, title: t.name, blurb: t.blurb })),
];

/**
 * Shown on /app in place of the Dashboard while someone has nothing to look
 * at yet (see isFirstRun). One decision: how to start the first project.
 */
export function FirstRunScreen({
  onChoose,
  busy,
  error,
  existingProject,
}: {
  onChoose: (choice: FirstRunChoice, name: string) => void;
  /** The choice being created right now, if any. */
  busy: FirstRunChoice | null;
  error: React.ReactNode;
  /** Their one (empty) project, if they already made one. */
  existingProject?: Project;
}) {
  // Asked up front, once: a first project named after its template ("My first
  // project", "Construction / facilities") makes people hunt for a rename
  // control before they have done any real work. Blank keeps the old defaults.
  const [name, setName] = useState("");
  return (
    <div className="first-run">
      <p className="first-run-eyebrow">WELCOME TO TASKETRA</p>
      <h1 className="first-run-title">Start your first project in 30 seconds.</h1>
      <p className="first-run-sub">
        Pick a starting point. WBS, RAID log, budget and roadmap are already set up. Change anything later.
      </p>

      <div className="first-run-name">
        <label htmlFor="first-run-project-name">Your project's name</label>
        <input
          id="first-run-project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Website relaunch, Kitchen remodel, Q1 hiring"
          disabled={busy !== null}
        />
        <p className="muted">Leave it blank and we'll use a starter name — you can rename it any time.</p>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <ul className="first-run-grid">
        {CARDS.map((c) => (
          <li key={c.choice} className={c.badge ? "first-run-card first-run-card-featured" : "first-run-card"}>
            {c.badge && <span className="first-run-badge">{c.badge}</span>}
            <h2 className="first-run-card-title">{c.title}</h2>
            <p className="first-run-card-blurb">{c.blurb}</p>
            <button
              type="button"
              className={c.badge ? "btn btn-primary" : "btn btn-ghost"}
              aria-label={`Use this template: ${c.title}`}
              disabled={busy !== null}
              onClick={() => onChoose(c.choice, name)}
            >
              {busy === c.choice ? "Setting up..." : "Use this template"}
            </button>
          </li>
        ))}
      </ul>

      <p className="first-run-blank">
        <button type="button" className="first-run-link" disabled={busy !== null} onClick={() => onChoose("blank", name)}>
          {busy === "blank" ? "Setting up..." : "Start from a blank project"}
        </button>
        {existingProject && (
          <>
            {" "}or <Link to={`/app/projects/${existingProject.id}`}>open {existingProject.name}</Link>
          </>
        )}
      </p>

      <div className="first-run-note">
        <p>
          I built Tasketra because I was tired of gluing five tools together. If anything is confusing,
          reply to any email from us. I read every one.
        </p>
        <p className="first-run-note-sign">Karissa</p>
      </div>

      <p className="first-run-footer">
        <Link to="/app/resources#how-it-works">How a project runs from Initiate to Close</Link>
      </p>
    </div>
  );
}
