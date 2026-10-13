import { PageHeader } from "../components/ui";
import { AppSidebar } from "../components/AppSidebar";
import { CHANGES } from "../lib/whatsNewData";
import { useDocumentTitle } from "../lib/documentTitle";

export default function WhatsNew() {
  useDocumentTitle("What's new");
  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader
          title="What's new"
          subtitle="Tasketra is in beta and shipping regularly. If something you rely on isn't here yet, use the Feedback link in the sidebar to let us know."
        />

        <div className="whats-new-list">
          {CHANGES.map((c) => (
            <section className="tw-card whats-new-entry" key={c.version}>
              <div className="whats-new-meta">
                <span className="pill pill-navy">{c.version}</span>
                <span className="muted">{c.date}</span>
              </div>
              <h2 className="heading-sm">{c.title}</h2>
              <p className="muted">{c.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
