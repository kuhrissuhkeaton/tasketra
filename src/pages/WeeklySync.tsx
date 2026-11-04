import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type WeeklySyncData } from "../lib/api";
import { useDocumentTitle } from "../lib/documentTitle";
import { PageHeader, SoftCard } from "../components/ui";
import { localDateKey } from "../lib/today";
import { daysBetween } from "../lib/calendarItems";
import { buildRecap, formatDateKey, projectStatusLine } from "../lib/syncRecap";

const CONTEXT_LIMIT = 140;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function truncate(text: string): string {
  return text.length > CONTEXT_LIMIT ? `${text.slice(0, CONTEXT_LIMIT).trimEnd()}…` : text;
}

/** "waiting 6 days" from the day the ask was raised; "raised today" on day zero. */
function waitingAge(createdAt: string, todayKey: string): string {
  const days = daysBetween(localDateKey(new Date(createdAt)), todayKey);
  if (days <= 0) return "raised today";
  return `waiting ${days} ${plural(days, "day", "days")}`;
}

export default function WeeklySync() {
  useDocumentTitle("Weekly sync");
  const [data, setData] = useState<WeeklySyncData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getWeeklySync().then(setData).catch(() => setError("Couldn't load your weekly sync."));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const todayKey = localDateKey(new Date());
  const recap = data ? buildRecap(data, todayKey) : "";

  async function copyRecap() {
    try {
      await navigator.clipboard.writeText(recap);
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the text stays
      // on screen to select and copy by hand; saying "Copied" would be a lie.
    }
  }

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader
          title="Weekly sync"
          subtitle={data
            ? `${data.projects.length} ${plural(data.projects.length, "project", "projects")} · ${data.asks.length} ${plural(data.asks.length, "ask", "asks")} waiting`
            : "Loading your sync..."}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && (
          <>
            <SoftCard title="Project status" className="ui-narrow">
              {data.projects.length === 0 ? (
                <p className="muted">No active projects.</p>
              ) : (
                <ul className="sync-list">
                  {data.projects.map((p) => (
                    <li className="sync-row" key={p.id}>
                      <Link className="sync-link" to={`/app/projects/${p.id}`}>
                        <span className="sync-name">{p.name}</span>
                        <span className="sync-line">{projectStatusLine(p, todayKey)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Asks to sort" className="ui-narrow">
              {data.asks.length === 0 ? (
                <p className="muted">No asks waiting.</p>
              ) : (
                <ul className="sync-list">
                  {data.asks.map((a) => (
                    <li className="sync-row" key={a.id}>
                      <Link className="sync-link" to={`/app/projects/${a.projectId}?tab=decisions`}>
                        <span className="sync-name">{a.title}</span>
                        <span className="sync-meta">
                          {a.projectName} · {a.deadline ? `Needed by ${formatDateKey(a.deadline)}` : "No date set"} · {waitingAge(a.createdAt, todayKey)}
                        </span>
                        {a.recipients.length > 0 && (
                          <span className="sync-meta">Waiting on: {a.recipients.join(", ")}</span>
                        )}
                        {a.context && <span className="sync-context">{truncate(a.context)}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Recap" className="ui-narrow">
              <pre className="sync-recap-text">{recap}</pre>
              <div className="sync-recap-actions">
                <button type="button" className="btn btn-primary" onClick={copyRecap}>
                  {copied ? "Copied" : "Copy recap"}
                </button>
              </div>
            </SoftCard>
          </>
        )}
      </main>
    </div>
  );
}
