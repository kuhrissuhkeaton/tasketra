import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Project, type ProjectStage, type PortfolioData, type PortfolioProjectSummary, type PortfolioDecision, type PortfolioRisk, type Task, type Issue, type UserTemplate, type MyTodayData, type CalendarItem } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { StageChip, STAGES, STAGE_LABEL } from "../components/StageRail";
import { ProjectSetupPicker } from "../components/ProjectSetup";
import type { ProjectSize, ProjectApproach } from "../lib/projectView";
import { PROJECT_TEMPLATES, getTemplate, isTemplateId, templateSummary } from "../lib/projectTemplates";
import { useConfirm } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { useIsWide } from "../lib/dashPrefs";
import { projectReason, projectReasonParts, sortByHealth } from "../lib/projectReason";
import { localDateKey } from "../lib/today";
import { buildNeedsAttention } from "../lib/needsAttention";
import { buildNeedsALook, type LookContext } from "../lib/needsALook";
import { HEALTH_LABEL, evidenceChallenge, headlineHealth } from "../lib/healthLabels";
import { DashboardCalendar } from "../components/DashboardCalendar";
import { monthRange, shiftMonth, daysBetween } from "../lib/calendarItems";
import { ResizableTable } from "../components/ResizableTable";
import { useAuth } from "../lib/auth-context";
import { fmtDate, fmtDateTime, fmtLocalDate } from "../lib/format";
import { shouldShowHubTip, HUB_TIP_STORAGE_KEY } from "../lib/hubTip";
import { useDelight } from "../lib/delight";
import { FirstRunScreen, type FirstRunChoice } from "../components/FirstRun";
import { isFirstRun, startChecklist } from "../lib/firstRun";
import { startDoingTour } from "../lib/doingTour";
import { track } from "../lib/analytics";
import { useDocumentTitle } from "../lib/documentTitle";
import { announce } from "../lib/announce";
import { Gauge } from "../components/charts/Gauge";
import { Donut } from "../components/charts/Donut";
import { VarianceBars } from "../components/charts/VarianceBars";
import { categoricalColor } from "../components/charts/palette";
import { fmtMoney } from "../lib/format";
import { decisionLeadLine } from "../lib/decisionWait";
import { sortRisks, riskScore } from "../lib/riskExposure";

const TASK_STATUS_ORDER: Task["status"][] = ["not_started", "in_progress", "blocked", "done"];

const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const HEALTH_PILL: Record<PortfolioProjectSummary["health"], string> = {
  on_track: "pill-green",
  at_risk: "pill-gold",
  off_track: "pill-red",
};

function fmtPct100(n: number | null): string {
  return n === null || n === undefined ? "--" : `${Math.round(n)}%`;
}

// A single stacked bar, one segment per task status -- reuses the same
// --slate/--navy/--red/--success mapping the Roadmap Gantt chart already
// uses for these exact four statuses (.gantt-bar-*), so "blocked" reads as
// the same red here as it does on a task's own timeline bar, never a new
// hue invented just for this chart.
function TaskStatusChart({ breakdown }: { breakdown: PortfolioData["taskStatusBreakdown"] }) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);
  const byStatus = Object.fromEntries(breakdown.map((b) => [b.status, b.count])) as Record<string, number>;

  if (total === 0) {
    return <p className="muted">No tasks yet across your projects.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
        {TASK_STATUS_ORDER.map((status) => {
          const count = byStatus[status] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={status}
              className={`gantt-bar-${status}`}
              style={{ width: `${pct}%` }}
              title={`${TASK_STATUS_LABEL[status]}: ${count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
        {TASK_STATUS_ORDER.map((status) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span className={`gantt-bar-${status}`} style={{ width: 10, height: 10, borderRadius: 3, display: "inline-block" }} />
            <span className="muted">{TASK_STATUS_LABEL[status]}</span>
            <strong>{byStatus[status] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// Donut for open issues by severity, rebuilt on the shared kit Donut in
// v164. Collapses high + critical into one "High / Critical" segment, same
// as ProjectHome.tsx's own SEVERITY_PILL already collapses high/critical
// to the same pill -- kept consistent with that instead of inventing a 4th
// category. v164 changes the fills from the status triad to the kit's
// categorical palette: severity here is a category breakdown (how many of
// each), and the kit rule is that status colors only ever carry a health
// verdict, never a category. The legend now also gives each count its
// "x of y · %" words, per the kit's every-percent-carries-words rule.
const ISSUE_DONUT_SEGMENTS: { key: "low" | "medium" | "highCritical"; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "highCritical", label: "High / Critical" },
];

function IssueSeverityDonut({ breakdown }: { breakdown: PortfolioData["issueSeverityBreakdown"] }) {
  const bySeverity = Object.fromEntries(breakdown.map((b) => [b.severity, b.count])) as Partial<Record<Issue["severity"], number>>;
  const counts: Record<"low" | "medium" | "highCritical", number> = {
    low: bySeverity.low || 0,
    medium: bySeverity.medium || 0,
    highCritical: (bySeverity.high || 0) + (bySeverity.critical || 0),
  };
  const total = counts.low + counts.medium + counts.highCritical;

  if (total === 0) {
    return <p className="muted">No open issues right now.</p>;
  }

  const segments = ISSUE_DONUT_SEGMENTS
    .map((seg, i) => ({ label: seg.label, value: counts[seg.key], color: categoricalColor(i) }))
    .filter((s) => s.value > 0);

  return (
    <Donut
      segments={segments}
      colors={segments.map((s) => s.color)}
      centerValue={String(total)}
      centerLabel="open"
      ariaLabel={`Open issues by severity: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
    />
  );
}

// ---------------------------------------------------------------------
// v164 (Portfolio Command): the visual home. Everything below reads the
// portfolio payload only -- the gauges, variance bars, status donut and
// the two bottom lists re-draw from the same filtered data as the tables
// under them, so the header's Client/Project + Status filters move every
// visual at once. Kit rules hold throughout: no chart from no data (an
// empty visual is one sentence plus the action that creates the data),
// and every percent carries its "x of y" words.
// ---------------------------------------------------------------------

/** Elapsed vs planned days across the active projects that carry roadmap
 *  dates. A project's planned span is its roadmap window (first to last
 *  date); elapsed clamps at the window's end, so a project past its last
 *  date reads fully used, never more than 100%. */
function timeUsedStats(projects: PortfolioProjectSummary[]): { elapsed: number; planned: number; count: number } {
  const today = localDateKey(new Date());
  let elapsed = 0;
  let planned = 0;
  let count = 0;
  for (const p of projects) {
    if (p.closed_at || !p.plannedStart || !p.plannedEnd) continue;
    const span = daysBetween(p.plannedStart, p.plannedEnd);
    if (span <= 0) continue;
    const through = today < p.plannedEnd ? today : p.plannedEnd;
    elapsed += Math.max(0, Math.min(span, daysBetween(p.plannedStart, through)));
    planned += span;
    count += 1;
  }
  return { elapsed, planned, count };
}

function PortfolioGauges({ data }: { data: PortfolioData }) {
  const active = data.projects.filter((p) => !p.closed_at);
  const totalTasks = active.reduce((s, p) => s + p.totalTasks, 0);
  const doneTasks = active.reduce((s, p) => s + p.doneTasks, 0);
  const time = timeUsedStats(active);
  // The Budget Used gauge exists only once money is actually moving: the
  // plan renders it "only when at least one project logs costs".
  const anyCosts = active.some((p) => (p.ac ?? 0) > 0);
  const budgeted = active.filter((p) => (p.bac ?? 0) > 0);
  const totalBac = budgeted.reduce((s, p) => s + (p.bac ?? 0), 0);
  const spentOnBudgeted = budgeted.reduce((s, p) => s + (p.ac ?? 0), 0);
  const budgetPct = totalBac > 0 ? Math.round((spentOnBudgeted / totalBac) * 100) : 0;
  const firstActive = active[0];
  const firstWithCosts = active.find((p) => (p.ac ?? 0) > 0);

  return (
    <div className={anyCosts ? "dash-gauges" : "dash-gauges dash-gauges-two"}>
      <div className="dash-viz-card">
        {totalTasks > 0 ? (
          <Gauge
            label="Portfolio completion"
            percent={(doneTasks / totalTasks) * 100}
            tone="brand"
            value={`${Math.round((doneTasks / totalTasks) * 100)}%`}
            words={`${doneTasks} of ${totalTasks} tasks done across ${active.length} active project${active.length === 1 ? "" : "s"}`}
          />
        ) : (
          <p className="dash-viz-empty">
            No tasks yet across your active projects.{" "}
            {firstActive && <Link to={`/app/projects/${firstActive.id}?tab=tasks`}>Open {firstActive.name} and add its first task</Link>}
          </p>
        )}
      </div>
      <div className="dash-viz-card">
        {time.count > 0 ? (
          <Gauge
            label="Time used"
            percent={(time.elapsed / time.planned) * 100}
            tone="brand"
            value={`${Math.round((time.elapsed / time.planned) * 100)}%`}
            words={`${time.elapsed} of ${time.planned} planned days used across ${time.count} project${time.count === 1 ? "" : "s"} with dates`}
          />
        ) : (
          <p className="dash-viz-empty">
            No project has roadmap dates yet, so there is no planned span to measure time against.{" "}
            {firstActive && <Link to={`/app/projects/${firstActive.id}?tab=roadmap`}>Add dates on a project's Roadmap</Link>}
          </p>
        )}
      </div>
      {anyCosts && (
        <div className="dash-viz-card">
          {totalBac > 0 ? (
            <Gauge
              label="Budget used"
              percent={budgetPct}
              tone={budgetPct > 100 ? "crit" : budgetPct >= 85 ? "warn" : "good"}
              value={`${budgetPct}%`}
              words={`${fmtMoney(spentOnBudgeted)} of ${fmtMoney(totalBac)} spent across ${budgeted.length} project${budgeted.length === 1 ? "" : "s"} with budgets`}
            />
          ) : (
            <p className="dash-viz-empty">
              Costs are being logged, but no project has a budget yet, so there is nothing to measure them against.{" "}
              {firstWithCosts && <Link to={`/app/projects/${firstWithCosts.id}?tab=budget`}>Set a budget on {firstWithCosts.name}</Link>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetVarianceCard({ projects }: { projects: PortfolioProjectSummary[] }) {
  const rows = projects
    .filter((p) => !p.closed_at && ((p.bac ?? 0) > 0 || (p.ac ?? 0) > 0))
    .map((p) => ({ id: p.id, label: p.name, planned: p.bac ?? 0, actual: p.ac ?? 0, href: `/app/projects/${p.id}?tab=budget` }));
  if (rows.length === 0) {
    return <p className="dash-viz-empty">No budgets or costs yet. Set a budget on a project and log its costs, and planned vs actual shows up here.</p>;
  }
  return <VarianceBars rows={rows} formatValue={fmtMoney} actualWord="Spent" />;
}

function ProjectsByStatusCard({ data }: { data: PortfolioData }) {
  // Stated status leads (v156): the donut counts projects by the health
  // their owner stated, exactly what headlineHealth resolves everywhere
  // else -- the evidence view stays in the Project health table below.
  const categories: { key: string; label: string }[] = [
    { key: "on_track", label: "On track" },
    { key: "at_risk", label: "At risk" },
    { key: "off_track", label: "Off track" },
    { key: "closed", label: "Closed" },
  ];
  const counts: Record<string, number> = { on_track: 0, at_risk: 0, off_track: 0, closed: 0 };
  for (const p of data.projects) {
    if (p.closed_at) counts.closed += 1;
    else counts[headlineHealth(p)] += 1;
  }
  const segments = categories
    .map((c, i) => ({ label: c.label, value: counts[c.key], color: categoricalColor(i) }))
    .filter((s) => s.value > 0);
  const total = data.projects.length;
  return (
    <Donut
      segments={segments}
      colors={segments.map((s) => s.color)}
      centerValue={String(total)}
      centerLabel={total === 1 ? "project" : "projects"}
      ariaLabel={`Projects by status: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}
    />
  );
}

function WaitingLongestList({ decisions }: { decisions: PortfolioDecision[] }) {
  const top = decisions.slice(0, 5);
  if (top.length === 0) {
    return <p className="dash-viz-empty">Nobody is waiting on a decision right now. When you ask someone to decide, the longest waits show up here.</p>;
  }
  return (
    <>
      <div className="dash-list-rows">
        {top.map((d) => (
          <div className="dash-list-row" key={d.id}>
            <Link className="dash-list-title" to={`/app/projects/${d.projectId}?tab=decisions`}>{d.title}</Link>
            <div className="dash-list-meta">{decisionLeadLine(d)}</div>
            <div className="dash-list-meta">in <Link to={`/app/projects/${d.projectId}`}>{d.projectName}</Link></div>
          </div>
        ))}
      </div>
      <p className="dash-viz-more"><Link to="/app/decisions">See all decisions</Link></p>
    </>
  );
}

const RISK_STATUS_WORD: Record<PortfolioRisk["status"], string> = { open: "Open", monitoring: "Monitoring", resolved: "Resolved" };

function riskPillLabel(r: PortfolioRisk): string {
  const score = riskScore(r);
  if (score !== null) return `P${r.probability_score} · I${r.impact_score} · Score ${score}`;
  const cap = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);
  return `P ${cap(r.probability)} · I ${cap(r.impact)}`;
}

function TopRisksList({ risks }: { risks: PortfolioRisk[] }) {
  // v157/v158 ordering: the shared exposure comparator, highest first --
  // the same order the per-project register and matrix use.
  const top = sortRisks(risks, "exposure").slice(0, 5);
  if (top.length === 0) {
    return <p className="dash-viz-empty">No open risks across your projects. Risks you log on a project show up here, biggest exposure first.</p>;
  }
  return (
    <>
      <div className="dash-list-rows">
        {top.map((r) => (
          <div className="dash-list-row" key={r.id}>
            <span className="pill pill-navy">{riskPillLabel(r)}</span>{" "}
            <Link className="dash-list-title" to={`/app/projects/${r.projectId}?tab=risks`}>{r.title}</Link>
            <div className="dash-list-meta">in <Link to={`/app/projects/${r.projectId}`}>{r.projectName}</Link> · {RISK_STATUS_WORD[r.status]}</div>
          </div>
        ))}
      </div>
      <p className="dash-viz-more"><Link to="/app/risks">See all risks &amp; issues</Link></p>
    </>
  );
}

function PortfolioOverview({ data, wide, glance }: { data: PortfolioData; wide: boolean; glance?: ReactNode }) {
  const { kpis } = data;
  const [showAllMs, setShowAllMs] = useState(false);
  const MS_CAP = 5;
  const milestones = showAllMs ? data.upcomingMilestones : data.upcomingMilestones.slice(0, MS_CAP);
  return (
    <div className="dash-reporting">
      {/* v164: the visual home sits above the glance calendar and the
          collapsible sections, which keep their order, titles and open
          defaults -- the sections below remain the detail behind these
          summaries (the Project health table is the status donut's table
          of real projects). With no projects at all there is nothing to
          chart, so the whole block steps aside for the sections' own
          empty states. */}
      {data.projects.length > 0 && (
        <>
          <PortfolioGauges data={data} />
          <div className="dash-viz-grid">
            <section className="dash-viz-card">
              <h3>Budget variance by project</h3>
              <BudgetVarianceCard projects={data.projects} />
            </section>
            <section className="dash-viz-card">
              <h3>Projects by status</h3>
              <ProjectsByStatusCard data={data} />
            </section>
          </div>
          <div className="dash-viz-grid">
            <section className="dash-viz-card">
              <h3>Waiting longest</h3>
              <WaitingLongestList decisions={data.openDecisions ?? []} />
            </section>
            <section className="dash-viz-card">
              <h3>Top risks</h3>
              <TopRisksList risks={data.openRisks ?? []} />
            </section>
          </div>
        </>
      )}

      {glance}

      <CollapsibleSection
        id="health"
        title="Project health"
        summary={`${data.projects.length} project${data.projects.length === 1 ? "" : "s"}`}
        wide={wide}
        defaultOpenWide={true}
        defaultOpenNarrow={false}
      >
        {data.projects.length === 0 ? (
          <p className="muted dash-empty">No projects to report on yet.</p>
        ) : (
          <ResizableTable id="dashboard-health">
            <thead>
              <tr><th>Project</th><th>Stage</th><th>Status</th><th>Tasks</th><th>Overdue</th><th>OKR progress</th><th>Next step</th></tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/app/projects/${p.id}`}>{p.name}</Link></td>
                  <td><StageChip stage={p.stage} small /></td>
                  <td>
                    {p.closed_at ? (
                      <span className="pill pill-neutral">Closed</span>
                    ) : (
                      <>
                        <span className={`pill ${HEALTH_PILL[headlineHealth(p)]}`}>{HEALTH_LABEL[headlineHealth(p)]}</span>
                        {evidenceChallenge(p) && (
                          <span className="evidence-note"> · <span className={`evidence-dot evidence-${evidenceChallenge(p)!}`} aria-hidden="true" />Evidence suggests {HEALTH_LABEL[evidenceChallenge(p)!]}</span>
                        )}
                        {p.escalations.length > 0 && (
                          <span className="pill pill-red escalate-pill" title={p.escalations.join(". ")}>Needs escalation</span>
                        )}
                      </>
                    )}
                  </td>
                  {/* v159 (F-13): task completion as a real progress bar plus
                      "x of y tasks" -- the same rendering the Projects list
                      uses -- instead of a bare fraction. (The panel's
                      "0 of 3 projects" column does not exist in code; this
                      bare fraction was the progress column that failed to
                      render as progress. See V159_FIXES.md.) */}
                  <td>
                    <span className="pw-progress" title={p.totalTasks > 0 ? `${p.doneTasks} of ${p.totalTasks} tasks done` : "No tasks yet"}>
                      <span className="progress-track" aria-hidden="true"><span className="progress-fill" style={{ width: `${p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0}%` }} /></span>
                      <span className="muted">{p.totalTasks > 0 ? `${p.doneTasks} of ${p.totalTasks} tasks` : "No tasks"}</span>
                    </span>
                  </td>
                  <td className="muted" style={p.overdueTasks > 0 ? { color: "var(--red)" } : undefined}>{p.overdueTasks}</td>
                  <td className="muted">{p.objectivesCount > 0 ? fmtPct100(p.avgObjectiveProgress) : "--"}</td>
                  {/* v164: the Next Step deep-link (the v158 pattern) makes
                      this table the status donut's table of real items:
                      project, stated status, next step. The per-project
                      Risks/Issues count columns stepped aside for it --
                      every open risk and issue now lives one click away
                      in the cross-project Risks & Issues view and the Top
                      risks list above. */}
                  <td>
                    {p.closed_at ? (
                      <span className="muted">—</span>
                    ) : p.nextUp ? (
                      p.nextUpTab ? (
                        <Link className="btn-link" to={`/app/projects/${p.id}?tab=${p.nextUpTab}`} aria-label={`Next step for ${p.name}: ${p.nextUp}`}>{p.nextUp}</Link>
                      ) : (
                        <span>{p.nextUp}</span>
                      )
                    ) : (
                      <span className="muted">Nothing queued</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="milestones"
        title="Upcoming milestones"
        summary={data.upcomingMilestones.length > 0 ? `${data.upcomingMilestones.length} upcoming` : "none"}
        wide={wide}
        defaultOpenWide={true}
        defaultOpenNarrow={false}
      >
        {data.upcomingMilestones.length === 0 ? (
          <p className="muted dash-empty">
            {data.undatedMilestones > 0
              ? `No dated milestones coming up — ${data.undatedMilestones} milestone${data.undatedMilestones === 1 ? " has" : "s have"} no date set, so ${data.undatedMilestones === 1 ? "it can't" : "they can't"} appear here yet.`
              : "No upcoming milestones on any roadmap."}
          </p>
        ) : (
          <>
            <ul className="dash-ms-list">
              {milestones.map((m) => (
                <li key={m.id} className="dash-ms-row">
                  <span className="dash-ms-date">{fmtLocalDate(m.date)}</span>
                  <span className="dash-ms-title">{m.title}</span>
                  <Link to={`/app/projects/${m.projectId}`} className="dash-ms-project">{m.projectName}</Link>
                </li>
              ))}
            </ul>
            {data.upcomingMilestones.length > MS_CAP && (
              <button type="button" className="btn-link dash-ms-more" onClick={() => setShowAllMs((v) => !v)}>
                {showAllMs ? "Show fewer" : `Show all ${data.upcomingMilestones.length}`}
              </button>
            )}
            {data.undatedMilestones > 0 && (
              <p className="muted">{data.undatedMilestones} more milestone{data.undatedMilestones === 1 ? " has" : "s have"} no date set and {data.undatedMilestones === 1 ? "isn't" : "aren't"} listed here.</p>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="charts"
        title="Charts and analytics"
        summary="Tasks, issues, objectives"
        wide={wide}
        defaultOpenWide={false}
        defaultOpenNarrow={false}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 380px", minWidth: 320 }}>
          <h3 style={{ marginBottom: 12 }}>Tasks by status</h3>
          <TaskStatusChart breakdown={data.taskStatusBreakdown} />
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <h3 style={{ marginBottom: 12 }}>Open issues by severity</h3>
          <IssueSeverityDonut breakdown={data.issueSeverityBreakdown} />
        </div>
        </div>
      {kpis.totalObjectives > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Objectives across your projects</h3>
          <div className="progress-track" style={{ maxWidth: 480 }}>
            <div className="progress-fill" style={{ width: `${kpis.avgObjectiveProgress ?? 0}%` }} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>{fmtPct100(kpis.avgObjectiveProgress)} average progress</span>
            {kpis.objectivesOnTrack > 0 && <span className="pill pill-green">{kpis.objectivesOnTrack} on track</span>}
            {kpis.objectivesAtRisk > 0 && <span className="pill pill-gold">{kpis.objectivesAtRisk} at risk</span>}
            {kpis.objectivesOffTrack > 0 && <span className="pill pill-red">{kpis.objectivesOffTrack} off track</span>}
            {kpis.objectivesAchieved > 0 && <span className="pill pill-navy">{kpis.objectivesAchieved} achieved</span>}
          </div>
        </div>
      )}

      </CollapsibleSection>
    </div>
  );
}

export default function Dashboard() {
  useDocumentTitle("Projects");
  const wide = useIsWide();
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<ProjectStage | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "list" | "dashboard" = searchParams.get("view") === "dashboard" ? "dashboard" : "list";
  function setView(v: "list" | "dashboard") {
    const next = new URLSearchParams(searchParams);
    if (v === "dashboard") next.set("view", "dashboard"); else next.delete("view");
    setSearchParams(next, { replace: true });
  }
  const [listFilter, setListFilter] = useState<"all" | "attention" | "on_track">("all");
  const [listSearch, setListSearch] = useState("");
  const [listSummaries, setListSummaries] = useState<PortfolioProjectSummary[]>([]);
  // v142 glance band inputs: the Today feed (for overdue ages) and the
  // calendar items for the visible month (for the calendar and decision ages).
  const [todayFeed, setTodayFeed] = useState<MyTodayData | null>(null);
  const [calMonth, setCalMonth] = useState<string>(() => localDateKey(new Date()).slice(0, 7));
  const [calItems, setCalItems] = useState<CalendarItem[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  // Per-browser convenience only: if storage is unavailable the tip simply
  // shows again, which is harmless.
  const [hubTipDismissed, setHubTipDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HUB_TIP_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  function dismissHubTip() {
    setHubTipDismissed(true);
    try {
      localStorage.setItem(HUB_TIP_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }
  const [seedExample, setSeedExample] = useState(false);
  // Pre-selected when arriving from the Resource Hub ("Start a project from this").
  const [templateId, setTemplateId] = useState<string>(() => {
    const fromLink = searchParams.get("template");
    return isTemplateId(fromLink) ? fromLink : "";
  });
  // Your own saved templates, offered after the built-in ones. A failure just leaves them out.
  const [myTemplates, setMyTemplates] = useState<UserTemplate[]>([]);
  useEffect(() => {
    api.listUserTemplates().then((r) => setMyTemplates(r.templates)).catch(() => {});
  }, []);
  const [showSetup, setShowSetup] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [setupSize, setSetupSize] = useState<ProjectSize>("standard");
  const [setupApproach, setSetupApproach] = useState<ProjectApproach>("hybrid");
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [firstRunBusy, setFirstRunBusy] = useState<FirstRunChoice | null>(null);
  const [firstRunError, setFirstRunError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();

  async function load() {
    setLoading(true);
    const [{ projects }, { projects: deleted }, portfolioData] = await Promise.all([
      api.listProjects(),
      api.listDeletedProjects(),
      api.getPortfolio(),
    ]);
    setProjects(projects);
    setDeletedProjects(deleted);
    setPortfolio(portfolioData);
    setListSummaries(portfolioData.projects);
    setLoading(false);
    // Not awaited: the glance band fills in when this lands, and a failure
    // just leaves the ages unknown (the sentences fall back to counts).
    api.getMyToday().then(setTodayFeed).catch(() => {});
  }

  useEffect(() => {
    const { from, to } = monthRange(calMonth);
    setCalLoading(true);
    api
      .getMyCalendar(from, to)
      .then((r) => setCalItems(r.items))
      .catch(() => setCalItems([]))
      .finally(() => setCalLoading(false));
  }, [calMonth]);

  // Filter bar only re-fetches the portfolio rollup, not the whole page --
  // the project grid/deleted list below don't depend on this filter.
  async function refreshPortfolio(id: string | null, stage: ProjectStage | null) {
    setSelectedProjectId(id);
    setSelectedStage(stage);
    setPortfolioLoading(true);
    const portfolioData = await api.getPortfolio(id ?? undefined, stage ?? undefined);
    setPortfolio(portfolioData);
    setPortfolioLoading(false);
  }

  const selectProject = (id: string | null) => refreshPortfolio(id, selectedStage);

  // Picking a stage drops a project filter that no longer matches it.
  function selectStage(stage: ProjectStage | null) {
    const stillMatches = selectedProjectId !== null && projects.some((p) => p.id === selectedProjectId && (!stage || p.stage === stage));
    refreshPortfolio(stillMatches ? selectedProjectId : null, stage);
  }

  const ATTENTION_CAP = 5;
  const visibleIds = new Set((selectedStage ? projects.filter((p) => p.stage === selectedStage) : projects).map((p) => p.id));
  const attention = portfolio
    ? buildNeedsAttention(
        portfolio.projects.filter((x) => visibleIds.has(x.id)),
        Object.fromEntries(projects.map((p) => [p.id, p.open_decisions ?? 0])),
      )
    : [];
  // v151 (Part A2): the attention rows' "Next up" hint names its stage --
  // it is the first unfinished item on that stage's checklist, not a task.
  const stageById = new Map((portfolio?.projects ?? []).map((p) => [p.id, p.stage]));

  // v142 "Needs a look" context: ages and quiet spells per project, each one
  // only claimed when the data behind it is complete (see lib/needsALook.ts).
  const todayKey = localDateKey(new Date());
  const overdueAge: Record<string, number> = {};
  if (todayFeed && !todayFeed.truncated) {
    for (const t of todayFeed.tasks) {
      if (!t.due_date || t.due_date >= todayKey) continue;
      const age = daysBetween(t.due_date, todayKey);
      if (overdueAge[t.project_id] === undefined || age > overdueAge[t.project_id]) {
        overdueAge[t.project_id] = age;
      }
    }
  }
  const decisionItemsByProject = new Map<string, CalendarItem[]>();
  for (const item of calItems) {
    if (item.kind !== "decision") continue;
    const list = decisionItemsByProject.get(item.project_id) ?? [];
    list.push(item);
    decisionItemsByProject.set(item.project_id, list);
  }
  const lookContext: Record<string, Partial<LookContext>> = {};
  for (const p of projects) {
    const open = p.open_decisions ?? 0;
    const decItems = decisionItemsByProject.get(p.id) ?? [];
    // The fetched range only holds some of a project's open decisions; the
    // age is honest only when it accounts for every one of them.
    const oldestDecisionDays =
      open > 0 && decItems.length >= open
        ? Math.max(...decItems.map((i) => daysBetween(i.created_date ?? i.date, todayKey)))
        : null;
    const lastRef = p.last_activity_at
      ? localDateKey(new Date(p.last_activity_at))
      : (p.content_count ?? 0) === 0
        ? localDateKey(new Date(p.created_at))
        : null;
    lookContext[p.id] = {
      openDecisions: open,
      oldestOverdueDays: overdueAge[p.id] ?? null,
      oldestDecisionDays: oldestDecisionDays !== null && oldestDecisionDays >= 0 ? oldestDecisionDays : null,
      quietDays: lastRef ? Math.max(0, daysBetween(lastRef, todayKey)) : null,
    };
  }
  const look = portfolio
    ? buildNeedsALook(portfolio.projects.filter((x) => visibleIds.has(x.id)), lookContext)
    : [];
  const visibleCalItems = calItems.filter(
    (i) => visibleIds.has(i.project_id) && (!selectedProjectId || i.project_id === selectedProjectId),
  );
  // v159 (F-12): the "Needs a look" sentences no longer live in their own
  // glance section -- they merge into the one Needs attention list (see
  // lookOnly below), so the glance band is the calendar on its own.
  const glanceBand = (
    <div className="dash-glance-cal">
      <DashboardCalendar
        items={visibleCalItems}
        month={calMonth}
        todayKey={todayKey}
        loading={calLoading}
        onShiftMonth={(d) => setCalMonth((m) => shiftMonth(m, d))}
      />
    </div>
  );
  // Look sentences for projects the attention list does not already carry:
  // the two lists read the same signals, so a project appears once, in the
  // richer attention row when it qualifies for both.
  const attentionIds = new Set(attention.map((a) => a.id));
  const lookOnly = look.filter((s) => !attentionIds.has(s.id));
  const visibleProjects = selectedStage ? projects.filter((p) => p.stage === selectedStage) : projects;
  const stageCount = (stage: ProjectStage) => projects.filter((p) => p.stage === stage).length;

  useEffect(() => {
    load();
  }, []);

  async function restoreProject(id: string) {
    setRestoringId(id);
    await api.restoreProject(id);
    await load();
    announce("Project restored.");
    setRestoringId(null);
  }

  async function renameProject(p: Project) {
    const name = renameValue.trim();
    if (!name || name === p.name) { setRenamingId(null); return; }
    setRenameBusy(true);
    try {
      await api.updateProject(p.id, { name });
      setRenamingId(null);
      await load();
      announce("Project renamed.");
    } catch (err) {
      setUpgradeNotice(err instanceof Error ? err.message : "Couldn't rename the project.");
    } finally {
      setRenameBusy(false);
    }
  }

  async function deleteProject(p: Project) {
    setOpenMenuId(null);
    if (!(await confirmDialog(`Delete "${p.name}"? Everything in it -- tasks, decisions, meetings, everything -- goes with it. You can restore it from Recently deleted below.`, "Delete"))) {
      return;
    }
    setDeletingId(p.id);
    try {
      await api.deleteProject(p.id);
      await load();
      announce("Project deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    // Say so instead of silently doing nothing: a click on Create with an
    // empty name used to look like a dead button.
    if (!newName.trim()) { setNameError("Give the project a name first."); return; }
    setNameError("");
    // Captured before the request, not after -- this create() call is what
    // would make it non-zero.
    const isFirstProjectEver = projects.length === 0;
    setCreating(true);
    setUpgradeNotice(null);
    try {
      const created = await api.createProject(newName.trim(), undefined, seedExample && !templateId, {
        size: setupSize,
        approach: setupApproach,
        ...(templateId ? { template: templateId } : {}),
      });
      if (templateId && created.templateApplied === false) {
        // The project exists, but its skeleton did not fully load. Say so
        // rather than dropping the user into a half-empty project unannounced.
        setUpgradeNotice("Your project was created, but we couldn't add the template. Open it from the list below and add items by hand.");
        setNewName("");
        setTemplateId("");
        setShowNew(false);
        await load();
        return;
      }
      const { project } = created;
      setNewName("");
      setTemplateId("");
      setSeedExample(false);
      setShowSetup(false);
      setSetupSize("standard");
      setSetupApproach("hybrid");
      // v161 (F-09): same as the first-run screen -- a first project gets
      // the doing tour, and the narration tour no longer auto-starts.
      if (user && isFirstProjectEver) startDoingTour(user.id, project.id);
      navigate(`/app/projects/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.upgradeRequired) {
        setUpgradeNotice(err.message);
      } else {
        setUpgradeNotice(err instanceof Error ? err.message : "Couldn't create project.");
      }
    } finally {
      setCreating(false);
    }
  }

  function openNewProject() {
    setUpgradeNotice(null);
    // v161: example data is ON by default for a first project only (the
    // review's F-09 note: "today it is an unchecked box"). Every later
    // project opens with it off, exactly as before.
    setSeedExample(projects.length === 0);
    setShowNew(true);
  }

  // From the first-run screen: one click makes the project and opens it. The
  // screen now asks for a name first; the old starter names remain as the
  // fallback when the field is left blank.
  async function startFirstProject(choice: FirstRunChoice, givenName?: string) {
    const template = choice !== "example" && choice !== "blank" ? getTemplate(choice) : undefined;
    const name = givenName?.trim() || (choice === "example" ? "Example project" : template ? template.name : "My first project");
    const isFirstProjectEver = projects.length === 0;
    setFirstRunBusy(choice);
    setFirstRunError(null);
    try {
      const created = await api.createProject(name, undefined, choice === "example", {
        size: "standard",
        // No Set up step on this screen, so take the approach the template is built for.
        approach: template ? template.suggestedApproach : "hybrid",
        ...(template ? { template: template.id } : {}),
      });
      track("template_chosen", { template: choice });
      if (template && created.templateApplied === false) {
        setFirstRunError({ message: "Your project was created, but we couldn't add the template. Open it below and add items by hand.", upgrade: false });
        await load();
        return;
      }
      const { project } = created;
      if (user && choice !== "blank") startChecklist(user.id, project.id);
      // v161 (F-09): the doing tour is the first-run guide now -- three
      // steps completed by doing, on this very project, blank path
      // included. The 10-step narration tour no longer auto-starts on a
      // first project; it stays available as the replay (Help, Resources).
      if (user && isFirstProjectEver) startDoingTour(user.id, project.id);
      navigate(`/app/projects/${project.id}`);
    } catch (err) {
      setFirstRunError({
        message: err instanceof Error ? err.message : "Couldn't create project.",
        upgrade: err instanceof ApiError && err.upgradeRequired,
      });
    } finally {
      setFirstRunBusy(null);
    }
  }

  const taskCounts = Object.fromEntries((portfolio?.projects ?? []).map((p) => [p.id, p.totalTasks]));
  const firstRun = !loading && isFirstRun(projects, taskCounts);

  // v164: the top tabs' "+ New project" lands here as ?new=1 (the tabs sit
  // outside this page, so the link has to carry the intent). Open the same
  // modal the page's own button opens, then drop the param so a refresh
  // does not reopen it. On the first-run screen there is no modal -- the
  // screen itself is the project creator -- so the param is just cleared.
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!wantsNew || loading) return;
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    if (!firstRun) openNewProject();
    // openNewProject reads current state only; the param + load state are
    // the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, loading, firstRun]);

  const totalOpenDecisions = projects.reduce((sum, p) => sum + (p.open_decisions || 0), 0);

  // v151 (Part A1): the subtitle uses the same single needs-attention
  // definition as the tile, chip and section heading (the attention list).
  const attentionCount = attention.length;
  const byId = new Map(listSummaries.map((x) => [x.id, x]));
  const rows = sortByHealth(
    projects.map((p) => {
      const s2 = byId.get(p.id);
      const health: PortfolioProjectSummary["health"] = s2?.health ?? "on_track";
      const total = s2?.totalTasks ?? 0;
      const done = s2?.doneTasks ?? 0;
      return {
        project: p,
        health,
        // v156: the row's pill shows the headline health (the stated status
        // when a check-in stated one); `health` stays the evidence value
        // the sort, filter and reason text reason over.
        headline: s2 ? headlineHealth(s2) : health,
        challenge: s2 ? evidenceChallenge(s2) : null,
        name: p.name,
        overdueTasks: s2?.overdueTasks ?? 0,
        total,
        done,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        reason: p.closed_at ? `Closed ${fmtDate(p.closed_at)}` : s2 ? projectReason(s2, p.open_decisions ?? 0) : "Loading details...",
        // v158: when the reason IS the stage checklist's next step, it
        // links straight to the tab that completes it.
        reasonTab: (() => {
          if (!s2 || p.closed_at || !s2.nextUpTab) return null;
          const parts = projectReasonParts(s2, p.open_decisions ?? 0);
          return parts.length === 1 && parts[0].nextUp ? s2.nextUpTab : null;
        })(),
      };
    }),
  );
  const shownRows = rows.filter((r) => (listFilter === "all" ? true : listFilter === "attention" ? r.health !== "on_track" && !r.project.closed_at : r.health === "on_track"))
    .filter((r) => !listSearch.trim() || r.project.name.toLowerCase().includes(listSearch.trim().toLowerCase()));
  // v159 (F-12 + Egg 8): the page subline IS the morning band now -- one
  // line of text carrying the day's five numbers, replacing the repeated
  // "N need attention" statements and the four stat cards (removed below).
  // Egg 8: on a Monday with nothing overdue anywhere, the overdue segment
  // reads "Clean sheet Monday." instead of a zero. v163: the egg rides
  // the Delight toggle -- off, the segment is the plain zero again.
  const { enabled: delight } = useDelight();
  const oldestDecisionDays = Math.max(
    0,
    ...Object.values(lookContext).map((c) => c.oldestDecisionDays ?? 0),
  );
  const overdueTotal = portfolio?.kpis.overdueTasks ?? null;
  const isMonday = new Date().getDay() === 1;
  const summaryLine = loading
    ? "Loading your projects..."
    : projects.length === 0
    ? "No projects yet"
    : [
        new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        `${projects.length} ${projects.length === 1 ? "project" : "projects"} · ${attentionCount === 0 ? "all on track" : `${attentionCount} ${attentionCount === 1 ? "needs" : "need"} attention`}`,
        ...(totalOpenDecisions > 0
          ? [`${totalOpenDecisions} ${totalOpenDecisions === 1 ? "decision" : "decisions"} awaiting a response${oldestDecisionDays > 0 ? `, oldest ${oldestDecisionDays} ${oldestDecisionDays === 1 ? "day" : "days"}` : ""}`]
          : []),
        ...(overdueTotal !== null
          ? [overdueTotal === 0 && isMonday && delight ? "Clean sheet Monday." : `${overdueTotal} overdue`]
          : []),
      ].join(" · ");

  const deletedSection = deletedProjects.length > 0 && (
    <div style={{ marginTop: 32 }}>
      <button className="btn-link" type="button" onClick={() => setShowDeleted((v) => !v)}>
        {showDeleted ? "Hide" : "Show"} recently deleted ({deletedProjects.length})
      </button>
      {showDeleted && (
        <ResizableTable id="dashboard-deleted" style={{ marginTop: 12, maxWidth: 640 }}>
          <thead>
            <tr><th>Project</th><th>Deleted</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {deletedProjects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{fmtDateTime(p.deleted_at)}</td>
                <td className="row-actions">
                  <button
                    className="btn-link"
                    type="button"
                    disabled={restoringId === p.id}
                    onClick={() => restoreProject(p.id)}
                  >
                    {restoringId === p.id ? "Restoring..." : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </ResizableTable>
      )}
    </div>
  );

  if (firstRun) {
    return (
      <div className="project-shell">
        <AppSidebar />
        <main id="main-content" className="project-main">
          <FirstRunScreen
            onChoose={startFirstProject}
            busy={firstRunBusy}
            existingProject={projects[0]}
            error={firstRunError && (
              <>
                {firstRunError.message}
                {firstRunError.upgrade && <>{" "}<Link to="/app/billing">Upgrade to Pro</Link></>}
              </>
            )}
          />
          {deletedSection}
        </main>
      </div>
    );
  }

  return (
    <div className="project-shell">
      <AppSidebar />

      <main id="main-content" className={`project-main tw-main${view === "dashboard" ? " project-main-wide" : ""}`}>
        <div className="page-head">
          <div>
            <h1>Projects</h1>
            <p className="muted tw-sub">{summaryLine}</p>
          </div>
          <div className="page-head-actions">
            <div className="tw-toggle" role="group" aria-label="View">
              <button type="button" className="btn btn-ghost" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
              <button type="button" className="btn btn-ghost" aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>Dashboard</button>
            </div>
            <button type="button" className="btn btn-primary" onClick={openNewProject}>New project</button>
          </div>
        </div>

        {showNew && (
          <Modal title="New project" onClose={() => setShowNew(false)}>
            <form className="new-project-form" onSubmit={createProject}>
              <label className="field">
                Project name
                <input
                  aria-label="New project name"
                  placeholder="New project name"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); if (nameError) setNameError(""); }}
                  data-autofocus
                />
              </label>
              {nameError && <p className="form-error" role="alert">{nameError}</p>}
              <label className="field">
                Start from
                <select
                  aria-label="Start from"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Blank project</option>
                  {PROJECT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  {myTemplates.length > 0 && (
                    <optgroup label="Your templates">
                      {myTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              {templateId && getTemplate(templateId) && (
                <p className="muted">
                  {getTemplate(templateId)!.blurb} We'll add {templateSummary(getTemplate(templateId)!)}, with dates counted
                  from today. It works best with the {getTemplate(templateId)!.suggestedApproach} approach (change it under More options).
                  Stakeholders are placeholder roles; replace them with real people. Delete anything you don't need.
                </p>
              )}
              {templateId && !getTemplate(templateId) && myTemplates.find((t) => t.id === templateId) && (
                <p className="muted">
                  {myTemplates.find((t) => t.id === templateId)!.description || "Your saved template."} We'll add{" "}
                  {myTemplates.find((t) => t.id === templateId)!.summary}, with dates counted from today. Statuses start fresh and no
                  people are copied. Delete anything you don't need.
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setShowSetup((v) => !v)}
                  aria-expanded={showSetup}
                  aria-controls="new-project-more"
                >
                  {showSetup ? "Hide options" : "More options"}
                </button>
              </div>
              <div id="new-project-more" className="new-project-more" hidden={!showSetup}>
                <label className="checkbox-row" style={{ opacity: templateId ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    checked={seedExample && !templateId}
                    disabled={!!templateId}
                    onChange={(e) => setSeedExample(e.target.checked)}
                  />
                  Start with example data
                </label>
                {seedExample && !templateId && (
                  <p className="muted">
                    We'll pre-fill this project with sample tasks, a roadmap, and one issue, risk,
                    assumption, and dependency, so you have something to explore right away. Delete
                    anything you don't want.
                  </p>
                )}
                <div className="setup-panel">
                  <ProjectSetupPicker
                    size={setupSize}
                    approach={setupApproach}
                    onChange={(n) => { setSetupSize(n.size); setSetupApproach(n.approach); }}
                  />
                </div>
              </div>
              {upgradeNotice && (
                <p className="form-error" role="alert">
                  {upgradeNotice}{" "}
                  <Link to="/app/billing">Upgrade to Pro</Link>
                </p>
              )}
              <div className="new-project-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={creating}>{creating ? "Creating..." : "Create project"}</button>
              </div>
            </form>
          </Modal>
        )}

        {upgradeNotice && !showNew && (
          <p className="form-error">
            {upgradeNotice}{" "}
            <Link to="/app/billing">Upgrade to Pro</Link>
          </p>
        )}

        {view === "list" && (
          <>
            {!loading && projects.length > 1 && (
              <div className="pw-search">
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search projects by name"
                  aria-label="Search projects by name"
                />
              </div>
            )}
            {!loading && projects.length > 1 && (
              <div className="pw-filters" role="group" aria-label="Filter projects">
                {([
                  ["all", "All", rows.length],
                  ["attention", "Needs attention", attention.length],
                  ["on_track", "On track", rows.filter((r) => r.health === "on_track").length],
                ] as const).map(([key, label, n]) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip${listFilter === key ? " filter-chip-active" : ""}`}
                    aria-pressed={listFilter === key}
                    onClick={() => setListFilter(key)}
                  >
                    {label} <span className="tw-count">{n}</span>
                  </button>
                ))}
              </div>
            )}

        {shouldShowHubTip({ loading, projectCount: projects.length, dismissed: hubTipDismissed }) && (
          <div className="hub-tip" role="note">
            <p>
              <strong>New here?</strong> See{" "}
              <Link to="/app/resources#how-it-works">how a project runs from Initiate to Close</Link>, or{" "}
              <Link to="/app/resources#templates">start from a template</Link> for a ready-made skeleton.
            </p>
            <button type="button" className="hub-tip-close" aria-label="Dismiss this tip" onClick={dismissHubTip}>×</button>
          </div>
        )}

            {loading ? (
              <ul className="pw-list" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li className="pw-row" key={i} style={{ pointerEvents: "none" }}>
                    <div className="pw-main"><div className="skel skel-title" /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
                  </li>
                ))}
              </ul>
            ) : projects.length === 0 ? (
              <p className="muted">No projects yet. <button type="button" className="btn-link" onClick={openNewProject}>Create your first project</button>.</p>
            ) : shownRows.length === 0 ? (
              <p className="muted">{listFilter === "attention" ? "Nothing needs attention right now." : "No projects match this filter."}</p>
            ) : (
              <ul className="pw-list">
                {shownRows.map((r) => (
                  <li className="pw-row" key={r.project.id} style={{ opacity: deletingId === r.project.id ? 0.5 : 1 }}>
                    <div className="pw-main">
                      {renamingId === r.project.id ? (
                        <form
                          className="pw-rename"
                          onSubmit={(e) => { e.preventDefault(); void renameProject(r.project); }}
                        >
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            aria-label="Project name"
                            autoFocus
                            disabled={renameBusy}
                          />
                          <button type="submit" className="btn btn-small btn-primary" disabled={renameBusy || !renameValue.trim()}>Save</button>
                          <button type="button" className="btn btn-small btn-ghost" disabled={renameBusy} onClick={() => setRenamingId(null)}>Cancel</button>
                        </form>
                      ) : (
                        <Link to={`/app/projects/${r.project.id}`} className="pw-name">{r.project.name}</Link>
                      )}
                      {r.reasonTab ? (
                        <Link className="pw-reason muted" to={`/app/projects/${r.project.id}?tab=${r.reasonTab}`}>{r.reason}</Link>
                      ) : (
                        <span className="pw-reason muted">{r.reason}</span>
                      )}
                      {r.challenge && !r.project.closed_at && (
                        <span className="pw-evidence evidence-note"><span className={`evidence-dot evidence-${r.challenge}`} aria-hidden="true" />Evidence suggests {HEALTH_LABEL[r.challenge]}</span>
                      )}
                      <span className="pw-activity muted">
                        {r.project.last_activity_at
                          ? `Last activity ${fmtDate(r.project.last_activity_at)}`
                          : (r.project.content_count ?? 0) > 0
                            ? `Created ${fmtDate(r.project.created_at)}`
                            : `Created ${fmtDate(r.project.created_at)} · Nothing added yet`}
                      </span>
                    </div>
                    <div className="pw-meta">
                      <span className="pw-cell pw-cell-health">{r.project.closed_at ? <span className="pill pill-neutral">Closed</span> : <span className={`pill ${HEALTH_PILL[r.headline]}`}>{HEALTH_LABEL[r.headline]}</span>}</span>
                      <span className="pw-cell pw-cell-stage"><StageChip stage={r.project.stage ?? "initiate"} small /></span>
                      <span className="pw-progress" title={r.total > 0 ? `${r.done} of ${r.total} tasks done` : "No tasks yet"}>
                        <span className="progress-track" aria-hidden="true"><span className="progress-fill" style={{ width: `${r.pct}%` }} /></span>
                        <span className="muted">{r.total > 0 ? `${r.done}/${r.total}` : "No tasks"}</span>
                      </span>
                    </div>
                    {r.project.is_owner !== false && (
                      <div className="pw-menu">
                        <button
                          className="project-card-menu-btn"
                          type="button"
                          aria-label={`Actions for ${r.project.name}`}
                          disabled={deletingId === r.project.id}
                          onClick={() => setOpenMenuId(openMenuId === r.project.id ? null : r.project.id)}
                        >
                          ⋮
                        </button>
                        {openMenuId === r.project.id && (
                          <>
                            <div className="project-card-menu-backdrop" onClick={() => setOpenMenuId(null)} />
                            <div className="project-card-menu">
                              <button className="project-card-menu-item" type="button" onClick={() => { setOpenMenuId(null); setRenamingId(r.project.id); setRenameValue(r.project.name); }}>
                                Rename project
                              </button>
                              <button className="project-card-menu-item" type="button" onClick={() => deleteProject(r.project)}>
                                Delete project
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="pw-foot"><Link to="/app/resources#how-it-works" className="btn-link">How a project runs in Tasketra</Link></p>
          </>
        )}

        {view === "dashboard" && (
          <>
        {!loading && projects.length > 1 && (
          <div className="pw-selects dashboard-filters" role="group" aria-label="Filter the dashboard">
            <label className="pw-select">
              <span className="muted">Stage</span>
              <select
                value={selectedStage ?? ""}
                onChange={(e) => selectStage(e.target.value ? (e.target.value as ProjectStage) : null)}
              >
                <option value="">All stages</option>
                {STAGES.map((st) => (
                  <option key={st.id} value={st.id}>{st.label} ({stageCount(st.id)})</option>
                ))}
              </select>
            </label>
            <label className="pw-select">
              <span className="muted">Project</span>
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => selectProject(e.target.value || null)}
              >
                <option value="">All projects</option>
                {visibleProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {!loading && portfolio && (
          <section className="dash-sec dash-attention" aria-labelledby="dash-attention-title">
            <h2 className="dash-sec-head dash-sec-head-static" id="dash-attention-title">
              <span className="dash-sec-title">Needs attention</span>
              {attention.length > 0 && <span className="dash-sec-summary">{attention.length} project{attention.length === 1 ? "" : "s"}</span>}
            </h2>
            {attention.length === 0 && lookOnly.length === 0 ? (
              <p className="dash-attention-empty">Nothing needs attention right now.</p>
            ) : (
              <>
                <ul className="dash-attention-list">
                  {(showAllAttention ? attention : attention.slice(0, ATTENTION_CAP)).map((a) => (
                    <li key={a.id} className="dash-attention-row">
                      <Link to={`/app/projects/${a.id}`} className="dash-attention-name">{a.name}</Link>
                      <span className="dash-attention-reasons">
                        <span className="sr-only">Flagged because: </span>
                        {a.reasons.map((r) => (
                          <span key={r.key} className={`pill pill-${r.tone}`} title={r.explain}>{r.label}<span className="sr-only">. {r.explain}</span></span>
                        ))}
                      </span>
                      {a.nextUp && (
                        a.nextUpTab ? (
                          <Link className="dash-attention-next muted" to={`/app/projects/${a.id}?tab=${a.nextUpTab}`}><span>Next up{stageById.get(a.id) ? ` in ${STAGE_LABEL[stageById.get(a.id)!]}` : ""}</span> {a.nextUp}</Link>
                        ) : (
                          <span className="dash-attention-next muted"><span>Next up{stageById.get(a.id) ? ` in ${STAGE_LABEL[stageById.get(a.id)!]}` : ""}</span> {a.nextUp}</span>
                        )
                      )}
                    </li>
                  ))}
                </ul>
                {attention.length > ATTENTION_CAP && (
                  <button type="button" className="btn-link dash-attention-more" onClick={() => setShowAllAttention((v) => !v)}>
                    {showAllAttention ? "Show fewer" : `Show all ${attention.length}`}
                  </button>
                )}
                {/* v159 (F-12): the old "Needs a look" sentences, merged
                    into this one list for projects the rows above do not
                    already cover. */}
                {lookOnly.length > 0 && (
                  <ul className="dash-attention-list dash-look-list">
                    {lookOnly.map((s) => (
                      <li key={`${s.id}-${s.key}`} className="dash-look-row">
                        <Link className="dash-look-link" to={`/app/projects/${s.id}`}>
                          <strong>{s.name}</strong>
                          {s.rest}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {loading ? (
          <div className="evm-grid" style={{ marginBottom: 32 }}>
            {[0, 1, 2, 3].map((i) => (
              <div className="evm-card" key={i} style={{ pointerEvents: "none" }}>
                <div className="skel skel-text" style={{ width: "60%" }} />
                <div className="skel skel-title" style={{ width: "40%", marginBottom: 0 }} />
              </div>
            ))}
          </div>
        ) : portfolio && projects.length > 0 ? (
          <div style={{ opacity: portfolioLoading ? 0.6 : 1, transition: "opacity 120ms ease" }}>
            <PortfolioOverview data={portfolio} wide={wide} glance={glanceBand} />
          </div>
        ) : null}

          </>
        )}

        {deletedSection}
      </main>
    </div>
  );
}
