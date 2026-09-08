import { AppSidebar } from "../components/AppSidebar";

type ChangeEntry = { version: string; date: string; title: string; body: string };

// A user-facing summary of what's shipped, in plain language -- not the full
// engineering changelog (that lives in the internal knowledge base). Add a
// new entry here each time a release ships something worth telling users
// about; skip pure bug fixes and internal refactors that don't change what
// they can do.
const CHANGES: ChangeEntry[] = [
  {
    version: "v48",
    date: "August 2026",
    title: "Feedback, properly this time",
    body: "The Feedback link now opens a quick in-app form instead of just firing off an email -- and if what you asked for ships, you'll hear back directly.",
  },
  {
    version: "v29",
    date: "August 2026",
    title: "You're looking at it",
    body: "A What's new page, so you can see what's changed without asking. Also added a small Beta tag around the app, and a Feedback link in the sidebar if something's broken or missing.",
  },
  {
    version: "v28",
    date: "August 2026",
    title: "Connections",
    body: "Send a project's activity (tasks, issues, decisions, and more) to any webhook URL -- Zapier, Make, Slack, or your own endpoint. Turn it on per project from the new Connections tab.",
  },
  {
    version: "v26",
    date: "August 2026",
    title: "Change requests & lessons learned",
    body: "Track scope changes with schedule/budget impact and an approval workflow, right inside Decisions. Log what went well, what didn't, and action items as you go, right inside Weekly report.",
  },
  {
    version: "v25",
    date: "August 2026",
    title: "Team workload view",
    body: "The Team tab now shows open, blocked, and overdue task counts per person, so you can see who's stretched thin at a glance.",
  },
  {
    version: "v24",
    date: "August 2026",
    title: "Complete RAID tracking",
    body: "Assumptions and Dependencies joined Issues and Risks as fully tracked items, right where the rest of your RAID log already lives.",
  },
  {
    version: "v22",
    date: "August 2026",
    title: "A real PM reference library",
    body: "The Resource hub grew a RAID log guide, a stakeholder engagement matrix, meeting cadence templates, and status-reporting tips -- all searchable.",
  },
  {
    version: "v21",
    date: "August 2026",
    title: "Friendlier delete confirmations",
    body: "Replaced the browser's native confirmation popups with an on-brand confirm dialog across the app.",
  },
  {
    version: "v18",
    date: "July 2026",
    title: "New look",
    body: "A persistent sidebar, cleaner navigation, and Tasketra's current visual identity.",
  },
];

export default function WhatsNew() {
  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>What's new</h1>
        </div>
        <p className="muted" style={{ marginBottom: 28, maxWidth: 640 }}>
          Tasketra is in beta and shipping regularly. Here's what's changed recently -- if
          something you rely on isn't here yet, use the Feedback link in the sidebar to let us
          know.
        </p>

        <div className="whats-new-list">
          {CHANGES.map((c) => (
            <div className="whats-new-entry" key={c.version}>
              <div className="whats-new-meta">
                <span className="pill pill-navy">{c.version}</span>
                <span className="muted">{c.date}</span>
              </div>
              <h4>{c.title}</h4>
              <p className="muted">{c.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
