import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type ActivityItem } from "../lib/api";
import { fmtDateTime } from "../lib/format";

const VERB: Record<string, string> = { created: "Created", updated: "Updated", deleted: "Deleted", restored: "Restored" };
const label = (entityType: string) => entityType.replace(/_/g, " ");

export default function MyActivity() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyActivity().then((r) => setItems(r.items)).catch(() => setError("Couldn't load your activity."));
  }, []);

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head"><h1>My activity</h1></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {items && items.length === 0 && (
          <p className="muted">
            Nothing here yet. What you create, change, delete or restore in your projects will show up here.
            Actions from before this page launched aren't included.
          </p>
        )}
        {items && items.length > 0 && (
          <div className="settings-card" style={{ maxWidth: 760 }}>
            <ul aria-label="Your recent activity" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((it) => (
                <li key={it.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line, #e6e0d2)" }}>
                  <div>
                    <strong>{VERB[it.action] ?? it.action}</strong> {label(it.entityType)}
                    {it.entityTitle ? <> &ldquo;{it.entityTitle}&rdquo;</> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    <Link to={`/app/projects/${it.projectId}`}>{it.projectName}</Link> &middot; {fmtDateTime(it.createdAt)}
                  </div>
                  {it.summary && <div className="muted" style={{ fontSize: 13 }}>{it.summary}</div>}
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Showing your most recent {items.length} actions.</p>
          </div>
        )}
      </main>
    </div>
  );
}
