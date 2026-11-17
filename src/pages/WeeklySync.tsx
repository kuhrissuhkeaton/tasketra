import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { api, type WeeklySyncAsk, type WeeklySyncData, type WeeklySyncProject } from "../lib/api";
import { useDocumentTitle } from "../lib/documentTitle";
import { PageHeader } from "../components/ui";
import { StatusExplainer } from "../components/StatusExplainer";
import { SyncBulletEditor } from "../components/SyncBulletEditor";
import { localDateKey } from "../lib/today";
import { daysBetween } from "../lib/calendarItems";
import { evidenceChallenge, headlineHealth, type HealthValue } from "../lib/healthLabels";
import { buildRecap, buildSyncSections, formatDateKey, projectStatusLine } from "../lib/syncRecap";
import { useDelight } from "../lib/delight";

const HEALTH_LOWER: Record<HealthValue, string> = { on_track: "on track", at_risk: "at risk", off_track: "off track" };
const HEALTH_LABEL: Record<HealthValue, string> = { on_track: "On track", at_risk: "At risk", off_track: "Off track" };

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

/** Whole days an ask has been waiting, never negative. */
function waitingDays(createdAt: string, todayKey: string): number {
  return Math.max(0, daysBetween(localDateKey(new Date(createdAt)), todayKey));
}

/**
 * The project's last sign of life as a date key: the most recent of its
 * last recorded activity and its last stated status. The same rule
 * projectStatusLine and buildSyncSections use for "quiet", shared here
 * so the stat strip's "checked in" count cannot drift from them.
 */
function lastSignKey(p: WeeklySyncProject): string | null {
  return [p.lastActivityAt, p.statedAt]
    .filter((t): t is string => !!t)
    .map((t) => localDateKey(new Date(t)))
    .sort()
    .pop() ?? null;
}

/** The Monday and Friday date keys of the week containing todayKey. */
function weekKeys(todayKey: string): { mon: string; fri: string } {
  const [y, m, d] = todayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const monday = new Date(y, m - 1, d - ((date.getDay() + 6) % 7));
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  const keyOf = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { mon: keyOf(monday), fri: keyOf(friday) };
}

/**
 * The recap card's "Checked in" prose: the projects grouped by headline
 * health, one sentence per group ("Website Relaunch is on track. Office
 * Move is off track."). The same grouping the copied recap counts by,
 * so the card and the clipboard can never disagree.
 */
function checkedInProse(projects: WeeklySyncProject[]): string {
  const sentences: string[] = [];
  for (const h of ["on_track", "at_risk", "off_track"] as HealthValue[]) {
    const names = projects.filter((p) => headlineHealth(p) === h).map((p) => p.name);
    if (names.length === 0) continue;
    sentences.push(`${names.join(", ")} ${names.length === 1 ? "is" : "are"} ${HEALTH_LOWER[h]}.`);
  }
  return sentences.join(" ");
}

/** One ask as a formatted recap line's tail: who, how long, by when. */
function askRecapTail(a: WeeklySyncAsk, todayKey: string): string {
  const parts: string[] = [];
  if (a.recipients.length > 0) parts.push(a.recipients.join(", "));
  parts.push(waitingAge(a.createdAt, todayKey));
  parts.push(a.deadline ? `needed by ${formatDateKey(a.deadline)}` : "no date set");
  return parts.join(", ");
}

type SectionLines = { wins: string[]; blockers: string[]; nextWeek: string[] };

const splitLines = (text: string): string[] =>
  text.split("\n").map((l) => l.trim()).filter(Boolean);

export default function WeeklySync() {
  useDocumentTitle("Weekly sync");
  const [data, setData] = useState<WeeklySyncData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // v160 (F-23) drafts, v167: the same pre-fill, held as bullet lines for
  // the click-to-edit editors. They exist only so the recap can carry
  // them; nothing is saved anywhere.
  const [sections, setSections] = useState<SectionLines | null>(null);

  useEffect(() => {
    api.getWeeklySync().then(setData).catch(() => setError("Couldn't load your weekly sync."));
  }, []);

  useEffect(() => {
    if (data && sections === null) {
      const filled = buildSyncSections(data, localDateKey(new Date()));
      setSections({
        wins: splitLines(filled.wins),
        blockers: splitLines(filled.blockers),
        nextWeek: splitLines(filled.nextWeek),
      });
    }
  }, [data, sections]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // v163: Egg 2 (Clean sweep) rides the Delight toggle like every egg.
  const { enabled: delight } = useDelight();
  const todayKey = localDateKey(new Date());
  const recapSections = sections
    ? { wins: sections.wins.join("\n"), blockers: sections.blockers.join("\n"), nextWeek: sections.nextWeek.join("\n") }
    : undefined;
  const recap = data ? buildRecap(data, todayKey, recapSections, { delight }) : "";
  // v159 (F-03): the header states the counts the way the recap counts
  // them -- by the headline (stated) health -- so the two never disagree.
  const statedCounts = data
    ? (["on_track", "at_risk", "off_track"] as HealthValue[])
        .map((h) => ({ h, n: data.projects.filter((p) => headlineHealth(p) === h).length }))
        .filter(({ n }) => n > 0)
        .map(({ h, n }) => `${n} ${HEALTH_LOWER[h]}`)
    : [];
  const anyChallenged = data?.projects.some((p) => evidenceChallenge(p)) ?? false;

  // v167 stat strip: every number is counted from the same payload (and
  // the same editable drafts) the rest of the page shows.
  const checkedIn = data
    ? data.projects.filter((p) => {
        const sign = lastSignKey(p);
        return sign !== null && daysBetween(sign, todayKey) < 7;
      }).length
    : 0;
  const oldestAsk = data && data.asks.length > 0
    ? Math.max(...data.asks.map((a) => waitingDays(a.createdAt, todayKey)))
    : null;
  const { mon, fri } = weekKeys(todayKey);
  const weekLabel = `${formatDateKey(mon)} – ${formatDateKey(fri)}`;

  const recapBlocks: { label: string; lines: string[] }[] = sections
    ? [
        { label: "Wins", lines: sections.wins },
        { label: "Blockers", lines: sections.blockers },
        { label: "Next week", lines: sections.nextWeek },
      ].filter((b) => b.lines.length > 0)
    : [];

  async function copyRecap() {
    try {
      await navigator.clipboard.writeText(recap);
      setCopied(true);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the recap
      // stays on screen in full; saying "Copied" would be a lie.
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
            <p className="sync-week">
              <span className="sync-week-chip">Week of {weekLabel}</span>
            </p>

            <section className="sync-stats" aria-label="This week at a glance">
              <div className="sync-stat">
                <span className="sync-stat-value">
                  {checkedIn}
                  <span className="sync-stat-of"> / {data.projects.length}</span>
                </span>
                <span className="sync-stat-label">Projects checked in</span>
              </div>
              <div className="sync-stat">
                <span className="sync-stat-value">{data.asks.length}</span>
                <span className="sync-stat-label">Asks waiting</span>
              </div>
              <div className="sync-stat">
                <span className="sync-stat-value">{oldestAsk === null ? "—" : oldestAsk}</span>
                <span className="sync-stat-label">Oldest ask, in days</span>
              </div>
              <div className="sync-stat">
                <span className="sync-stat-value">{sections?.wins.length ?? 0}</span>
                <span className="sync-stat-label">Wins logged</span>
              </div>
              <div className="sync-stat">
                <span className="sync-stat-value">{sections?.blockers.length ?? 0}</span>
                <span className="sync-stat-label">Blockers open</span>
              </div>
            </section>

            <section className="sync-step">
              <div className="sync-step-head">
                <span className="sync-step-num" aria-hidden="true">1</span>
                <div>
                  <h2 className="sync-step-title">Check-ins</h2>
                  <p className="sync-step-sub">Every active project and where it stands.</p>
                </div>
              </div>
              <div className="sync-card">
                {anyChallenged && <StatusExplainer />}
                {data.projects.length === 0 ? (
                  <p className="muted">No active projects.</p>
                ) : (
                  <ul className="sync-checkins">
                    {data.projects.map((p) => {
                      const challenge = evidenceChallenge(p);
                      const headline = headlineHealth(p);
                      return (
                        <li className="sync-checkin" key={p.id}>
                          <Link className="sync-checkin-link" to={`/app/projects/${p.id}`}>
                            <span className="sync-checkin-main">
                              <span className="sync-name">{p.name}</span>
                              <span className="sync-line">
                                {challenge && <span className={`evidence-dot evidence-${challenge}`} aria-hidden="true" />}
                                {projectStatusLine(p, todayKey)}
                              </span>
                            </span>
                            <span className={`sync-health-chip tone-${headline}`}>
                              <span className="sync-health-dot" aria-hidden="true" />
                              {HEALTH_LABEL[headline]}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="sync-step">
              <div className="sync-step-head">
                <span className="sync-step-num" aria-hidden="true">2</span>
                <div>
                  <h2 className="sync-step-title">Asks waiting</h2>
                  <p className="sync-step-sub">Decisions you are chasing, soonest needed first.</p>
                </div>
              </div>
              {data.asks.length === 0 ? (
                <div className="sync-card">
                  <p className="muted">No asks waiting.</p>
                </div>
              ) : (
                <div className="sync-ask-grid">
                  {data.asks.map((a) => {
                    const hot =
                      (a.deadline !== null && daysBetween(todayKey, a.deadline) < 0) ||
                      waitingDays(a.createdAt, todayKey) >= 7;
                    return (
                      <Link
                        className={`sync-ask-card${hot ? " hot" : ""}`}
                        key={a.id}
                        to={`/app/projects/${a.projectId}?tab=decisions`}
                      >
                        <span className="sync-ask-title">{a.title}</span>
                        <span className="sync-meta">
                          {a.projectName} · {a.deadline ? `Needed by ${formatDateKey(a.deadline)}` : "No date set"} · {waitingAge(a.createdAt, todayKey)}
                        </span>
                        {a.recipients.length > 0 && (
                          <span className="sync-meta">Waiting on: {a.recipients.join(", ")}</span>
                        )}
                        {a.context && <span className="sync-context">{truncate(a.context)}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* v160 (F-23): the narrative the auto recap cannot write --
                pre-filled from the week's facts, edited here, and copied
                as part of the recap below. Deliberately not saved: next
                week's page pre-fills afresh. v167: the textareas become
                click-to-edit bullet lists, per the kit layout. */}
            <section className="sync-step">
              <div className="sync-step-head">
                <span className="sync-step-num" aria-hidden="true">3</span>
                <div>
                  <h2 className="sync-step-title">Wins, blockers, next week</h2>
                  <p className="sync-step-sub">
                    Pre-filled from this week's activity. Edit the words before you copy the recap. Nothing here is saved.
                  </p>
                </div>
              </div>
              <div className="sync-card">
                {sections && (
                  <div className="sync-editors">
                    <SyncBulletEditor
                      title="Wins"
                      lines={sections.wins}
                      onChange={(wins) => setSections({ ...sections, wins })}
                    />
                    <SyncBulletEditor
                      title="Blockers"
                      lines={sections.blockers}
                      onChange={(blockers) => setSections({ ...sections, blockers })}
                    />
                    <SyncBulletEditor
                      title="Next week"
                      lines={sections.nextWeek}
                      onChange={(nextWeek) => setSections({ ...sections, nextWeek })}
                    />
                  </div>
                )}
              </div>
            </section>

            <section className="sync-step">
              <div className="sync-step-head">
                <span className="sync-step-num" aria-hidden="true">4</span>
                <div>
                  <h2 className="sync-step-title">Recap</h2>
                  <p className="sync-step-sub">
                    Formatted and ready to send. The Copy button puts the plain-text version on your clipboard.
                  </p>
                </div>
              </div>
              <div className="sync-card sync-recap-card">
                <div className="sync-recap-head">
                  <div className="sync-recap-heading">
                    <span className="sync-recap-name">Weekly sync recap</span>
                    <span className="sync-recap-meta">
                      {weekLabel} · {data.projects.length} {plural(data.projects.length, "project", "projects")}
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={copyRecap}>
                    {copied ? "Copied" : "Copy recap"}
                  </button>
                </div>
                <div className="sync-recap-block">
                  <h3 className="sync-recap-h">Checked in</h3>
                  {data.projects.length === 0 ? (
                    <p className="sync-recap-p">No active projects.</p>
                  ) : (
                    <p className="sync-recap-p">{checkedInProse(data.projects)}</p>
                  )}
                </div>
                {data.asks.length > 0 && (
                  <div className="sync-recap-block">
                    <h3 className="sync-recap-h">Waiting on</h3>
                    <ul className="sync-recap-list">
                      {data.asks.map((a) => (
                        <li key={a.id}>
                          <strong>{a.title}</strong> ({a.projectName}) — {askRecapTail(a, todayKey)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {recapBlocks.map((b) => (
                  <div className="sync-recap-block" key={b.label}>
                    <h3 className="sync-recap-h">{b.label}</h3>
                    <ul className="sync-recap-list">
                      {b.lines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {data.asks.length === 0 && data.projects.length > 0 && delight && (
                  <p className="sync-recap-p sync-recap-clean">Clean sweep: nobody is waiting on anybody.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
