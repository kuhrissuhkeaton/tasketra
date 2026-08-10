import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import {
  IconDecisions,
  IconMeetings,
  IconDocuments,
  IconTeam,
  IconLessons,
  IconAuditTrail,
} from "../components/FeatureIcons";
import shotGantt from "../assets/landing-gantt.png";
import shotRaid from "../assets/landing-raid.png";
import shotBudget from "../assets/landing-budget.png";
import shotRoadmap from "../assets/landing-roadmap.png";

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

const SPOTLIGHTS = [
  {
    title: "WBS, board & Gantt",
    body: "Break work into a real work breakdown structure with parent/child tasks. Switch between list, kanban board, and timeline/Gantt views of the same data -- not three different tools.",
    image: shotGantt,
    alt: "Tasketra Gantt timeline view showing tasks across several weeks, color-coded by status",
  },
  {
    title: "Full RAID log",
    body: "Risks, issues, assumptions, and dependencies in one tab, with severity/probability/impact scoring, mitigation plans, and owners attached to every entry.",
    image: shotRaid,
    alt: "Tasketra risk log showing exposure ratings, owners, and a mitigation plan",
  },
  {
    title: "Budget & EVM",
    body: "Planned value, earned value, cost and schedule variance -- calculated automatically from your task data as it moves, not a spreadsheet you update by hand every Friday.",
    image: shotBudget,
    alt: "Tasketra budget dashboard showing PV, EV, AC, CPI, SPI and other EVM metrics",
  },
  {
    title: "Project roadmap",
    body: "A standalone, exec-facing timeline of phases, milestones, and releases -- separate from the granular task Gantt. Share a public, read-only link with sponsors who don't need a login.",
    image: shotRoadmap,
    alt: "Tasketra roadmap view showing swimlanes with phase bars and milestone markers",
  },
];

const COMPACT_FEATURES = [
  {
    title: "Stakeholder decisions",
    body: "Shareable decision links with a real, timestamped answer back -- no login required on their end.",
    Icon: IconDecisions,
  },
  {
    title: "Meetings & change control",
    body: "Starter agendas, action items that become real tasks, and optional sign-off before a change is approved.",
    Icon: IconMeetings,
  },
  {
    title: "Documents & templates",
    body: "Generate a charter, risk register, or RACI matrix as a Word doc, pre-filled from the project.",
    Icon: IconDocuments,
  },
  {
    title: "Team & workload",
    body: "See open, blocked, and overdue tasks per owner -- know who's underwater before they tell you.",
    Icon: IconTeam,
  },
  {
    title: "Lessons learned & reporting",
    body: "A went-well / went-poorly retro log, plus one-click weekly status reports.",
    Icon: IconLessons,
  },
  {
    title: "A real audit trail",
    body: "Every edit, delete, and restore is logged, with a soft-delete Trash you can recover from.",
    Icon: IconAuditTrail,
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

        <section className="landing-spotlights">
          <h2>Everything you need to run a project</h2>
          <p className="landing-section-sub">
            Not a to-do list with extra steps -- the actual toolkit a PM reaches for, in one place.
          </p>
          {SPOTLIGHTS.map((s, i) => (
            <div key={s.title} className={`spotlight${i % 2 === 1 ? " spotlight-reverse" : ""}`}>
              <div className="spotlight-text">
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </div>
              <div className="spotlight-image">
                <img src={s.image} alt={s.alt} loading="lazy" />
              </div>
            </div>
          ))}
        </section>

        <section className="landing-features">
          <p className="landing-section-sub">And the rest of the toolkit that comes with every plan.</p>
          <div className="feature-grid-compact">
            {COMPACT_FEATURES.map((f) => (
              <div key={f.title} className="feature-card-compact">
                <span className="feature-icon">
                  <f.Icon />
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p className="muted">{f.body}</p>
                </div>
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
