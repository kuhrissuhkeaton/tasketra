import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Project, type ProjectStage, type PortfolioData, type PortfolioProjectSummary, type Task, type Issue, type UserTemplate } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { StageChip, STAGES } from "../components/StageRail";
import { ProjectSetupPicker } from "../components/ProjectSetup";
import type { ProjectSize, ProjectApproach } from "../lib/projectView";
import { PROJECT_TEMPLATES, getTemplate, isTemplateId, templateSummary } from "../lib/projectTemplates";
import { useConfirm } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { ResizableTable } from "../components/ResizableTable";
import { useAuth } from "../lib/auth-context";
import { fmtDateTime, fmtLocalDate } from "../lib/format";
import { shouldShowHubTip, HUB_TIP_STORAGE_KEY } from "../lib/hubTip";
import { FirstRunScreen, type FirstRunChoice } from "../components/FirstRun";
import { isFirstRun, startChecklist } from "../lib/firstRun";
import { track } from "../lib/analytics";

const TASK_STATUS_ORDER: Task["status"][] = ["not_started", "in_progress", "blocked", "done"];

const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const HEALTH_LABEL: Record<PortfolioProjectSummary["health"], string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
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
          <div key={status} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <span className={`gantt-bar-${status}`} style={{ width: 10, height: 10, borderRadius: 3, display: "inline-block" }} />
            <span className="muted">{TASK_STATUS_LABEL[status]}</span>
            <strong>{byStatus[status] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// Donut for open issues by severity. Collapses high + critical into one
// visual "High / Critical" arc + legend row, same as ProjectHome.tsx's own
// SEVERITY_PILL already collapses high/critical to the same pill-red --
// kept consistent with that instead of inventing a 4th on-chart color.
// The three fill colors (--chart-good/--chart-warn/--chart-crit) are a
// colorblind-safe status triad validated separately from the app's
// --tag-*/pill-* pastels, which are tuned for small text badges, not large
// chart fills -- see the comment above them in index.css.
const DONUT_SEGMENTS: { key: "low" | "medium" | "highCritical"; label: string; color: string }[] = [
  { key: "low", label: "Low", color: "var(--chart-good)" },
  { key: "medium", label: "Medium", color: "var(--chart-warn)" },
  { key: "highCritical", label: "High / Critical", color: "var(--chart-crit)" },
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

  let acc = 0;
  const stops: string[] = [];
  for (const seg of DONUT_SEGMENTS) {
    const count = counts[seg.key];
    if (count === 0) continue;
    const pct = (count / total) * 100;
    stops.push(`${seg.color} ${acc}% ${acc + pct}%`);
    acc += pct;
  }
  const gradient = `conic-gradient(${stops.join(", ")})`;

  return (
    <div className="dashboard-donut-wrap">
      <div className="dashboard-donut" style={{ background: gradient }}>
        <div className="dashboard-donut-hole">
          <strong>{total}</strong>
          <span>open</span>
        </div>
      </div>
      <div className="dashboard-donut-legend">
        {DONUT_SEGMENTS.map((seg) => (
          <div className="row-item" key={seg.key}>
            <span className="sw" style={{ background: seg.color }} />
            {seg.label}
            <strong>{counts[seg.key]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioOverview({ data }: { data: PortfolioData }) {
  const { kpis } = data;
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="evm-grid">
        <div className="evm-card" title="Projects you own or are an active member of">
          <div className="evm-label">Active projects</div>
          <div className="evm-value">{kpis.activeProjects}</div>
        </div>
        <div className={`evm-card ${kpis.atRiskProjects > 0 ? "evm-bad" : ""}`} title="Projects whose health score is at risk">
          <div className="evm-label">At risk</div>
          <div className="evm-value">{kpis.atRiskProjects}</div>
        </div>
        <div className={`evm-card ${kpis.offTrackProjects > 0 ? "evm-bad" : ""}`} title="Projects with a critical issue, an off-track objective, or a badly overrun score">
          <div className="evm-label">Off track</div>
          <div className="evm-value">{kpis.offTrackProjects}</div>
        </div>
        <div className={`evm-card ${kpis.overdueTasks > 0 ? "evm-bad" : ""}`} title="Leaf tasks past their due date, not yet done">
          <div className="evm-label">Overdue tasks</div>
          <div className="evm-value">{kpis.overdueTasks}</div>
        </div>
        <div className="evm-card" title="Open risks across every accessible project">
          <div className="evm-label">Open risks</div>
          <div className="evm-value">{kpis.openRisks}</div>
        </div>
        <div className={`evm-card ${kpis.highIssues > 0 ? "evm-bad" : ""}`} title="Open issues across every accessible project">
          <div className="evm-label">Open issues</div>
          <div className="evm-value">{kpis.openIssues}</div>
          <div className="evm-sub">{kpis.highIssues} high or critical</div>
        </div>
        <div className="evm-card" title="Average progress across every key result on every active objective">
          <div className="evm-label">OKR progress</div>
          <div className="evm-value">{fmtPct100(kpis.avgObjectiveProgress)}</div>
          <div className="evm-sub">{kpis.totalObjectives} objective{kpis.totalObjectives === 1 ? "" : "s"} tracked</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 24 }}>
        <div style={{ flex: "2 1 380px", minWidth: 320 }}>
          <h3 style={{ marginBottom: 12 }}>Tasks by status</h3>
          <TaskStatusChart breakdown={data.taskStatusBreakdown} />
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <h3 style={{ marginBottom: 12 }}>Open issues by severity</h3>
          <IssueSeverityDonut breakdown={data.issueSeverityBreakdown} />
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <h3 style={{ marginBottom: 12 }}>Upcoming milestones</h3>
          {data.upcomingMilestones.length === 0 ? (
            <p className="muted">No upcoming milestones on any roadmap.</p>
          ) : (
            <div>
              {data.upcomingMilestones.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div>{m.title}</div>
                    <Link to={`/app/projects/${m.projectId}`} className="muted" style={{ fontSize: 12.5 }}>{m.projectName}</Link>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtLocalDate(m.date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {kpis.totalObjectives > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Objectives across your projects</h3>
          <div className="progress-track" style={{ maxWidth: 480 }}>
            <div className="progress-fill" style={{ width: `${kpis.avgObjectiveProgress ?? 0}%` }} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{fmtPct100(kpis.avgObjectiveProgress)} average progress</span>
            {kpis.objectivesOnTrack > 0 && <span className="pill pill-green">{kpis.objectivesOnTrack} on track</span>}
            {kpis.objectivesAtRisk > 0 && <span className="pill pill-gold">{kpis.objectivesAtRisk} at risk</span>}
            {kpis.objectivesOffTrack > 0 && <span className="pill pill-red">{kpis.objectivesOffTrack} off track</span>}
            {kpis.objectivesAchieved > 0 && <span className="pill pill-navy">{kpis.objectivesAchieved} achieved</span>}
          </div>
        </div>
      )}

      {data.projects.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Project health</h3>
          <ResizableTable id="dashboard-health">
            <thead>
              <tr><th>Project</th><th>Stage</th><th>Health</th><th>Tasks</th><th>Overdue</th><th>Risks</th><th>Issues</th><th>OKR progress</th></tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/app/projects/${p.id}`}>{p.name}</Link></td>
                  <td><StageChip stage={p.stage} small /></td>
                  <td>
                    <span className={`pill ${HEALTH_PILL[p.health]}`}>{HEALTH_LABEL[p.health]}</span>
                    {p.escalations.length > 0 && (
                      <span className="pill pill-red escalate-pill" title={p.escalations.join(". ")}>Needs escalation</span>
                    )}
                  </td>
                  <td className="muted">{p.doneTasks}/{p.totalTasks}</td>
                  <td className="muted" style={p.overdueTasks > 0 ? { color: "var(--red)" } : undefined}>{p.overdueTasks}</td>
                  <td className="muted">{p.openRisks}{p.highRisks > 0 ? ` (${p.highRisks} high)` : ""}</td>
                  <td className="muted">{p.openIssues}{p.highIssues > 0 ? ` (${p.highIssues} high)` : ""}</td>
                  <td className="muted">{p.objectivesCount > 0 ? fmtPct100(p.avgObjectiveProgress) : "--"}</td>
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<ProjectStage | null>(null);
  const [escalations, setEscalations] = useState<Record<string, string[]>>({});
  const [nextUps, setNextUps] = useState<Record<string, string | null>>({});
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [searchParams] = useSearchParams();
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
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
    setEscalations(Object.fromEntries(portfolioData.projects.map((x) => [x.id, x.escalations])));
    setNextUps(Object.fromEntries(portfolioData.projects.map((x) => [x.id, x.nextUp])));
    setLoading(false);
  }

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

  const visibleProjects = selectedStage ? projects.filter((p) => p.stage === selectedStage) : projects;
  const stageCount = (stage: ProjectStage) => projects.filter((p) => p.stage === stage).length;

  useEffect(() => {
    load();
  }, []);

  async function restoreProject(id: string) {
    setRestoringId(id);
    await api.restoreProject(id);
    await load();
    setRestoringId(null);
  }

  async function deleteProject(p: Project) {
    setOpenMenuId(null);
    if (!(await confirmDialog(`Delete "${p.name}"? Everything in it -- tasks, decisions, meetings, everything -- goes with it. You can restore it from Recently deleted below.`))) {
      return;
    }
    setDeletingId(p.id);
    try {
      await api.deleteProject(p.id);
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
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
      const shouldStartTour = isFirstProjectEver && !user?.tour_completed_at;
      navigate(`/app/projects/${project.id}`, shouldStartTour ? { state: { startTour: true } } : undefined);
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
    setShowNew(true);
  }

  // From the first-run screen: one click makes the project and opens it.
  async function startFirstProject(choice: FirstRunChoice) {
    const template = choice !== "example" && choice !== "blank" ? getTemplate(choice) : undefined;
    const name = choice === "example" ? "Example project" : template ? template.name : "My first project";
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
      const shouldStartTour = isFirstProjectEver && !user?.tour_completed_at;
      navigate(`/app/projects/${project.id}`, shouldStartTour ? { state: { startTour: true } } : undefined);
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

  const totalOpenDecisions = projects.reduce((sum, p) => sum + (p.open_decisions || 0), 0);
  const totalOverdue = projects.reduce((sum, p) => sum + (p.overdue_tasks || 0), 0);

  const deletedSection = deletedProjects.length > 0 && (
    <div style={{ marginTop: 32 }}>
      <button className="btn-link" type="button" onClick={() => setShowDeleted((v) => !v)}>
        {showDeleted ? "Hide" : "Show"} recently deleted ({deletedProjects.length})
      </button>
      {showDeleted && (
        <ResizableTable id="dashboard-deleted" style={{ marginTop: 12, maxWidth: 640 }}>
          <thead>
            <tr><th>Project</th><th>Deleted</th><th></th></tr>
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
        <main className="project-main">
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

      <main className="project-main project-main-wide">
        <div className="page-head">
          <h1>Dashboard</h1>
          <div className="page-head-actions">
            <div className="stat-row">
              <div className="stat"><strong>{totalOpenDecisions}</strong> decisions awaiting response</div>
              <div className="stat"><strong>{totalOverdue}</strong> overdue tasks</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={openNewProject}>New project</button>
          </div>
        </div>

        {!loading && projects.length > 1 && (
          <div className="roadmap-filter-bar" style={{ marginBottom: 4 }}>
            <div className="roadmap-filter-group" role="group" aria-label="Filter by stage">
              <span className="filter-group-label">Stage</span>
              <button
                type="button"
                className={`filter-chip${selectedStage === null ? " filter-chip-active" : ""}`}
                onClick={() => selectStage(null)}
              >
                All stages
              </button>
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`filter-chip${selectedStage === s.id ? " filter-chip-active" : ""}`}
                  onClick={() => selectStage(s.id)}
                >
                  {s.label} {stageCount(s.id)}
                </button>
              ))}
            </div>
            <div className="roadmap-filter-group">
              <button
                type="button"
                className={`filter-chip${selectedProjectId === null ? " filter-chip-active" : ""}`}
                onClick={() => selectProject(null)}
              >
                All projects
              </button>
              {visibleProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`filter-chip${selectedProjectId === p.id ? " filter-chip-active" : ""}`}
                  onClick={() => selectProject(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
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
            <PortfolioOverview data={portfolio} />
          </div>
        ) : null}

        <div className="projects-head">
          <h3>Your projects</h3>
          <Link to="/app/resources#how-it-works" className="btn-link projects-head-link">How a project runs in Tasketra</Link>
        </div>

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

        {showNew && (
          <Modal title="New project" onClose={() => setShowNew(false)}>
            <form className="new-project-form" onSubmit={createProject}>
              <label className="field">
                Project name
                <input
                  aria-label="New project name"
                  placeholder="New project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-autofocus
                />
              </label>
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
                <button className="btn btn-primary" disabled={creating}>Create project</button>
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

        {loading ? (
          <div className="project-grid">
            {[0, 1, 2].map((i) => (
              <div className="project-card" key={i} style={{ pointerEvents: "none" }}>
                <div className="skel skel-title" />
                <div className="skel skel-text" style={{ width: "70%" }} />
                <div className="skel skel-text" style={{ width: "40%", marginBottom: 0 }} />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="muted">No projects yet. <button type="button" className="btn-link" onClick={openNewProject}>Create your first project</button>.</p>
        ) : visibleProjects.length === 0 ? (
          <p className="muted">No projects in this stage yet.</p>
        ) : (
          <div className="project-grid">
            {visibleProjects.map((p) => (
              <div className="project-card-wrap" key={p.id} style={{ opacity: deletingId === p.id ? 0.5 : 1 }}>
                <Link to={`/app/projects/${p.id}`} className="project-card">
                  <h3>{p.name}</h3>
                  {p.description && <p className="muted">{p.description}</p>}
                  <div className="project-card-stats">
                    <StageChip stage={p.stage} small />
                    {(escalations[p.id]?.length ?? 0) > 0 && (
                      <span className="pill pill-red" title={escalations[p.id].join(". ")}>Needs escalation</span>
                    )}
                    {(p.open_decisions ?? 0) > 0 && (
                      <span className="pill pill-gold">{p.open_decisions} awaiting decision</span>
                    )}
                    {(p.overdue_tasks ?? 0) > 0 && (
                      <span className="pill pill-red">{p.overdue_tasks} overdue</span>
                    )}
                  </div>
                  {nextUps[p.id] && <p className="project-card-next"><span>Next up</span> {nextUps[p.id]}</p>}
                </Link>

                {p.is_owner !== false && (
                  <>
                    <button
                      className="project-card-menu-btn"
                      type="button"
                      aria-label="Project actions"
                      disabled={deletingId === p.id}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenMenuId(openMenuId === p.id ? null : p.id);
                      }}
                    >
                      ⋮
                    </button>
                    {openMenuId === p.id && (
                      <>
                        <div className="project-card-menu-backdrop" onClick={() => setOpenMenuId(null)} />
                        <div className="project-card-menu">
                          <button className="project-card-menu-item" type="button" onClick={() => deleteProject(p)}>
                            Delete project
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {deletedSection}
      </main>
    </div>
  );
}
