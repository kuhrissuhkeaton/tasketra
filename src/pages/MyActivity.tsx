import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type ActivityItem } from "../lib/api";
import { useDocumentTitle } from "../lib/documentTitle";
import { PageHeader, SoftCard, AlignedList, ListGroupHead, ListRow } from "../components/ui";
import { localDateKey } from "../lib/today";

const VERB: Record<string, string> = { created: "Created", updated: "Updated", deleted: "Deleted", restored: "Restored" };
const label = (entityType: string) => entityType.replace(/_/g, " ");
const dayTitle = (iso: string, now: Date) => {
  const key = localDateKey(new Date(iso));
  if (key === localDateKey(now)) return "Today";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (key === localDateKey(y)) return "Yesterday";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function MyActivity() {
  useDocumentTitle("My activity");
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyActivity().then((r) => setItems(r.items)).catch(() => setError("Couldn't load your activity."));
  }, []);

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader
          title="My activity"
          subtitle={items ? (items.length === 0 ? "Nothing yet" : `Your ${items.length} most recent actions across your projects`) : "Loading your activity..."}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        {items && items.length === 0 && (
          <p className="muted">
            Nothing here yet. What you create, change, delete or restore in your projects will show up here.
            Actions from before this page launched aren't included.
          </p>
        )}
        {items && items.length > 0 && (
          <SoftCard className="ui-narrow">
            <AlignedList label="Your recent activity">
              {items.map((it, i) => {
                const now = new Date();
                const day = dayTitle(it.createdAt, now);
                const head = i === 0 || dayTitle(items[i - 1].createdAt, now) !== day;
                return (
                  <Fragment key={it.id}>
                    {head && <ListGroupHead title={day} />}
                    <ListRow
                      title={<><strong>{VERB[it.action] ?? it.action}</strong> {label(it.entityType)}{it.entityTitle ? <> &ldquo;{it.entityTitle}&rdquo;</> : null}</>}
                      meta={<><Link to={`/app/projects/${it.projectId}`}>{it.projectName}</Link>{it.summary ? <> &middot; {it.summary}</> : null}</>}
                      date={timeOf(it.createdAt)}
                    />
                  </Fragment>
                );
              })}
            </AlignedList>
          </SoftCard>
        )}
      </main>
    </div>
  );
}
