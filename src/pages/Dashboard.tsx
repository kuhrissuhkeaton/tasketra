import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Project, type PortfolioData, type PortfolioProjectSummary, type Task } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useConfirm } from "../components/ConfirmDialog";
import { ResizableTable } from "../components/ResizableTable";
import { useAuth } from "../lib/auth-context";
import { fmtDateTime, fmtLocalDate } from "../lib/format";

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
        <div style={{ flex: "2 1 420px", minWidth: 320 }}>
          <h3 style={{ marginBottom: 12 }}>Tasks by status</h3>
          <TaskStatusChart breakdown={data.taskStatusBreakdown} />
        </div>
        <div style={{ flex: "1 1 280px", minWidth: 260 }}>
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
              <tr><th>Project</th><th>Health</th><th>Tasks</th><th>Overdue</th><th>Risks</th><th>Issues</th><th>OKR progress</th></tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/app/projects/${p.id}`}>{p.name}</Link></td>
                  <td><span className={`pill ${HEALTH_PILL[p.health]}`}>{HEALTH_LABEL[p.health]}</span></td>
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
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [seedExample, setSeedExample] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    setLoading(false);
  }

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
      const { project } = await api.createProject(newName.trim(), undefined, seedExample);
      setNewName("");
      setSeedExample(false);
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

  const totalOpenDecisions = projects.reduce((sum, p) => sum + (p.open_decisions || 0), 0);
  const totalOverdue = projects.reduce((sum, p) => sum + (p.overdue_tasks || 0), 0);

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Dashboard</h1>
          <div className="stat-row">
            <div className="stat"><strong>{totalOpenDecisions}</strong> decisions awaiting response</div>
            <div className="stat"><strong>{totalOverdue}</strong> overdue tasks</div>
          </div>
        </div>

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
          <PortfolioOverview data={portfolio} />
        ) : null}

        <h3 style={{ marginBottom: 12 }}>Your projects</h3>

        <form className="inline-form" onSubmit={createProject}>
          <input
            placeholder="New project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <label className="checkbox-row" style={{ alignSelf: "center" }}>
            <input
              type="checkbox"
              checked={seedExample}
              onChange={(e) => setSeedExample(e.target.checked)}
            />
            Start with example data
          </label>
          <button className="btn btn-primary" disabled={creating}>Create project</button>
        </form>
        {seedExample && (
          <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
            We'll pre-fill this project with sample tasks, a roadmap, and one issue, risk,
            assumption, and dependency, so you have something to explore right away. Delete
            anything you don't want.
          </p>
        )}

        {upgradeNotice && (
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
          <p className="muted">No projects yet. Create your first one above.</p>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div className="project-card-wrap" key={p.id} style={{ opacity: deletingId === p.id ? 0.5 : 1 }}>
                <Link to={`/app/projects/${p.id}`} className="project-card">
                  <h3>{p.name}</h3>
                  {p.description && <p className="muted">{p.description}</p>}
                  <div className="project-card-stats">
                    {(p.open_decisions ?? 0) > 0 && (
                      <span className="pill pill-gold">{p.open_decisions} awaiting decision</span>
                    )}
                    {(p.overdue_tasks ?? 0) > 0 && (
                      <span className="pill pill-red">{p.overdue_tasks} overdue</span>
                    )}
                  </div>
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

        {deletedProjects.length > 0 && (
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
        )}
      </main>
    </div>
  );
}
