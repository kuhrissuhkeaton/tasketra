import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type WeeklySyncData } from "../lib/api";
import { useDocumentTitle } from "../lib/documentTitle";
import { PageHeader, SoftCard } from "../components/ui";
import { StatusExplainer } from "../components/StatusExplainer";
import { localDateKey } from "../lib/today";
import { daysBetween } from "../lib/calendarItems";
import { evidenceChallenge, headlineHealth, type HealthValue } from "../lib/healthLabels";
import { buildRecap, buildSyncSections, formatDateKey, projectStatusLine, type SyncSections } from "../lib/syncRecap";
import { useDelight } from "../lib/delight";

const HEALTH_LOWER: Record<HealthValue, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };

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
  // v160 (F-23): the Wins / Blockers / Next week drafts. Pre-filled once
  // the payload lands, then owned by the page -- they exist only so the
  // copied recap can carry them; nothing is saved anywhere.
  const [sections, setSections] = useState<SyncSections | null>(null);

  useEffect(() => {
    api.getWeeklySync().then(setData).catch(() => setError("Couldn't load your weekly sync."));
  }, []);

  useEffect(() => {
    if (data && sections === null) setSections(buildSyncSections(data, localDateKey(new Date())));
  }, [data, sections]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // v163: Egg 2 (Clean sweep) rides the Delight toggle like every egg.
  const { enabled: delight } = useDelight();
  const todayKey = localDateKey(new Date());
  const recap = data ? buildRecap(data, todayKey, sections ?? undefined, { delight }) : "";
  // v159 (F-03): the header states the counts the way the recap counts
  // them -- by the headline (stated) health -- so the two never disagree.
  const statedCounts = data
    ? (["on_track", "at_risk", "off_track"] as HealthValue[])
        .map((h) => ({ h, n: data.projects.filter((p) => headlineHealth(p) === h).length }))
        .filter(({ n }) => n > 0)
        .map(({ h, n }) => `${n} ${HEALTH_LOWER[h]}`)
    : [];
  const anyChallenged = data?.projects.some((p) => evidenceChallenge(p)) ?? false;

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
            ? `${data.projects.length} ${plural(data.projects.length, "project", "projects")} · ${data.asks.length} ${plural(data.asks.length, "ask", "asks")} waiting${statedCounts.length > 0 ? ` · as stated: ${statedCounts.join(", ")}` : ""}`
            : "Loading your sync..."}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && (
          <>
            <SoftCard title="Check-ins" className="ui-narrow">
              {anyChallenged && <StatusExplainer />}
              {data.projects.length === 0 ? (
                <p className="muted">No active projects.</p>
              ) : (
                <ul className="sync-list">
                  {data.projects.map((p) => {
                    const challenge = evidenceChallenge(p);
                    return (
                      <li className="sync-row" key={p.id}>
                        <Link className="sync-link" to={`/app/projects/${p.id}`}>
                          <span className="sync-name">{p.name}</span>
                          <span className="sync-line">
                            {challenge && <span className={`evidence-dot evidence-${challenge}`} aria-hidden="true" />}
                            {projectStatusLine(p, todayKey)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
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

            {/* v160 (F-23): the narrative the auto recap cannot write --
                pre-filled from the week's facts, edited here, and copied
                as part of the recap below. Deliberately not saved: next
                week's page pre-fills afresh. */}
            <SoftCard title="Wins, blockers, next week" className="ui-narrow">
              <p className="muted" style={{ marginTop: 0 }}>
                Pre-filled from this week's activity. Edit the words before you copy the recap, one item per line. Nothing here is saved.
              </p>
              {sections && (
                <div className="sync-sections">
                  <label htmlFor="sync-wins">Wins</label>
                  <textarea
                    id="sync-wins"
                    rows={3}
                    value={sections.wins}
                    onChange={(e) => setSections({ ...sections, wins: e.target.value })}
                  />
                  <label htmlFor="sync-blockers">Blockers</label>
                  <textarea
                    id="sync-blockers"
                    rows={3}
                    value={sections.blockers}
                    onChange={(e) => setSections({ ...sections, blockers: e.target.value })}
                  />
                  <label htmlFor="sync-next-week">Next week</label>
                  <textarea
                    id="sync-next-week"
                    rows={3}
                    value={sections.nextWeek}
                    onChange={(e) => setSections({ ...sections, nextWeek: e.target.value })}
                  />
                </div>
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
