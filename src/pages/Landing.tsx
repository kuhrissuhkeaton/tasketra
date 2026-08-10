import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Wordmark } from "../components/Wordmark";

const AUDIENCES = [
  {
    title: "Small teams without a PMO",
    body: "No project office, no dedicated tooling budget, no one to build you a template library. Tasketra comes with the structure already built in.",
  },
  {
    title: "Nonprofits running lean",
    body: "Grant-funded initiatives, volunteer coordinators, boards that want visibility -- without a $30k/year platform built for enterprise IT departments.",
  },
  {
    title: "PMs tired of stitching tools together",
    body: "A board for tasks, a spreadsheet for budget, a doc for risks, a deck for the exec update. Tasketra is where all of that already lives together.",
  },
  {
    title: "Consultants managing multiple clients",
    body: "Clean per-project structure, shareable decision links and a public roadmap view mean stakeholders get what they need without a login.",
  },
];

const FEATURE_GROUPS = [
  {
    title: "WBS, board & Gantt",
    body: "Break work into a real work breakdown structure with parent/child tasks. Switch between list, kanban board, and timeline/Gantt views of the same data -- not three different tools.",
  },
  {
    title: "Full RAID log",
    body: "Risks, issues, assumptions, and dependencies in one tab, with severity/probability/impact scoring, assumption validation status, and dependency direction with needed-by dates.",
  },
  {
    title: "Budget & EVM",
    body: "Planned value, earned value, cost and schedule variance -- calculated automatically from your task data as it moves, not a spreadsheet you update by hand every Friday.",
  },
  {
    title: "Stakeholder decisions",
    body: "Send a decision request with a shareable link. Get a real, timestamped answer back -- no account required on their end, no chasing a reply buried in email.",
  },
  {
    title: "Project roadmap",
    body: "A standalone, exec-facing timeline of phases, milestones, releases, and notes -- separate from the granular task Gantt. Share a public, read-only link with sponsors who don't need a login.",
  },
  {
    title: "Meetings & change control",
    body: "Log PM meetings by type with starter agendas, and turn action items straight into real tasks. Turn on Change Control Board mode when a change needs every reviewer's sign-off before it's approved.",
  },
  {
    title: "Documents & templates",
    body: "Generate a project charter, risk register, or RACI matrix as a Word doc, pre-filled from what's already in the project. Store supporting files right on the project, up to your plan's limit.",
  },
  {
    title: "Team & workload",
    body: "A workload view shows open, blocked, and overdue tasks per owner, so you know who's underwater before they tell you.",
  },
  {
    title: "Lessons learned & reporting",
    body: "A went-well / went-poorly / action-item retro log, plus one-click weekly status reports -- so the retro actually gets written down instead of living in someone's memory.",
  },
  {
    title: "A real audit trail",
    body: "Every edit, delete, and restore is logged automatically, with a soft-delete Trash you can recover from. Nothing disappears from a project without a trace.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    detail: "Up to 3 projects, 2GB of storage, every core feature. Enough to actually run something real before you ever hit a paywall.",
  },
  {
    name: "Pro",
    price: "14 days free",
    detail: "Unlimited projects and 25GB of storage. Cancel any time during the trial and it costs you nothing.",
  },
  {
    name: "Founding member",
    price: "Free, forever",
    detail: "The first 100 people to join get every Pro feature at no cost, permanently -- our thanks for being early.",
    highlight: true,
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

  const waitlistForm = done ? (
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
  );

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
            a spreadsheet for the budget. Tasketra starts with it already built in: WBS, EVM, RAID, decisions, and
            a stakeholder-ready roadmap, from day one.
          </p>

          {waitlistForm}
          {error && <div className="form-error">{error}</div>}
        </section>

        <section className="landing-audience">
          <h2>Who it's for</h2>
          <p className="landing-section-sub">
            Built by a project manager, not a software company -- for the people actually running the work.
          </p>
          <div className="audience-grid">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="audience-card">
                <h3>{a.title}</h3>
                <p className="muted">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-features">
          <h2>Everything you need to run a project</h2>
          <p className="landing-section-sub">
            Not a to-do list with extra steps -- the actual toolkit a PM reaches for, in one place.
          </p>
          <div className="feature-grid">
            {FEATURE_GROUPS.map((f) => (
              <div key={f.title} className="feature-card">
                <h3>{f.title}</h3>
                <p className="muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-plans">
          <h2>Start free. Stay free if you're one of the first 100.</h2>
          <p className="landing-section-sub">
            No credit card to try it. No feature-gated RAID log or Gantt view held behind a paywall.
          </p>
          <div className="plans-grid">
            {PLANS.map((p) => (
              <div key={p.name} className={`plan-card${p.highlight ? " plan-card-highlight" : ""}`}>
                {p.highlight && <span className="plan-badge">Limited</span>}
                <h3>{p.name}</h3>
                <p className="plan-price">{p.price}</p>
                <p className="muted">{p.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-cta-band">
          <h2>Ready to see it?</h2>
          <p className="landing-section-sub">
            Join the beta waitlist and we'll bring you in as we open up more spots.
          </p>
          {waitlistForm}
          {error && <div className="form-error">{error}</div>}
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
