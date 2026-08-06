import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Wordmark } from "../components/Wordmark";

const FEATURES = [
  {
    title: "WBS & Timeline",
    body: "Break work into a real work breakdown structure, with sub-tasks and a Gantt view -- not just a flat to-do list.",
  },
  {
    title: "Budget & EVM",
    body: "Planned value, earned value, cost and schedule variance, calculated automatically from your task data as it moves.",
  },
  {
    title: "Full RAID tracking",
    body: "Risks, issues, and decisions live in the project, not scattered across three spreadsheets and a Slack thread.",
  },
  {
    title: "Stakeholder decisions",
    body: "Send a decision request with a shareable link. Get a real answer, timestamped, with no account required on their end.",
  },
  {
    title: "Templates from live data",
    body: "Generate a project charter, risk register, or RACI matrix as a Word doc -- pre-filled from what's already in the project.",
  },
  {
    title: "A real changelog",
    body: "Every edit, delete, and restore is logged automatically. Nothing disappears from a project without a trace.",
  },
];

export default function Landing() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.joinWaitlist(email.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell landing">
      <header className="topbar">
        <Wordmark size="sm" beta />
        <div className="topbar-right">
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <h1>Project management built for project managers.</h1>
          <p className="landing-subhead">
            Most work-management tools make you build PM structure from scratch -- a board here, a risk log there,
            a spreadsheet for the budget. Tasketra starts with it already built in: WBS, EVM, RAID, and stakeholder
            sign-off, from day one.
          </p>

          {done ? (
            <p className="landing-confirm">
              You're on the list -- we'll be in touch when it's your turn.
            </p>
          ) : (
            <form className="landing-cta" onSubmit={joinWaitlist}>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Joining..." : "Join the beta"}
              </button>
            </form>
          )}
          {error && <div className="form-error">{error}</div>}
        </section>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="landing-footer-cta">
          <h2>Already invited?</h2>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </section>
      </main>

      <footer className="landing-legal-footer">
        <Link to="/legal/terms">Terms</Link>
        <span className="dot">&middot;</span>
        <Link to="/legal/privacy">Privacy</Link>
        <span className="dot">&middot;</span>
        <Link to="/legal">All legal documents</Link>
      </footer>
    </div>
  );
}
