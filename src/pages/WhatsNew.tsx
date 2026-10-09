import { AppSidebar } from "../components/AppSidebar";
import { CHANGES } from "../lib/whatsNewData";

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
