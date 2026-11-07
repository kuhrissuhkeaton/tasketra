import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../components/ui";
import { AppSidebar } from "../components/AppSidebar";
import { CHANGES } from "../lib/whatsNewData";
import { useDocumentTitle } from "../lib/documentTitle";

export default function WhatsNew() {
  useDocumentTitle("What's new");
  const { hash } = useLocation();
  // v151 (Part E2): the entries this visit just marked seen (stored by the
  // notification bell on arrival) keep a "New" pill for the visit, so
  // following a bell entry lands on a page that shows what was new.
  const [justSeen] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = sessionStorage.getItem("tasketra.whatsNewJustSeen");
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  // Bell entries deep-link to their section (#v151); scroll it into view.
  useEffect(() => {
    if (!hash) return;
    document.querySelector(hash)?.scrollIntoView({ block: "start" });
  }, [hash]);

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
            <section className="tw-card whats-new-entry" key={c.version} id={c.version}>
              <div className="whats-new-meta">
                <span className="pill pill-navy">{c.version}</span>
                {justSeen.has(c.version) && <span className="pill pill-gold">New</span>}
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
