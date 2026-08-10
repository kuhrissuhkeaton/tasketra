import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Project } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useConfirm } from "../components/ConfirmDialog";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const [{ projects }, { projects: deleted }] = await Promise.all([
      api.listProjects(),
      api.listDeletedProjects(),
    ]);
    setProjects(projects);
    setDeletedProjects(deleted);
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
    setCreating(true);
    setUpgradeNotice(null);
    try {
      const { project } = await api.createProject(newName.trim());
      setNewName("");
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

  const totalOpenDecisions = projects.reduce((sum, p) => sum + (p.open_decisions || 0), 0);
  const totalOverdue = projects.reduce((sum, p) => sum + (p.overdue_tasks || 0), 0);

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Your projects</h1>
          <div className="stat-row">
            <div className="stat"><strong>{totalOpenDecisions}</strong> decisions awaiting response</div>
            <div className="stat"><strong>{totalOverdue}</strong> overdue tasks</div>
          </div>
        </div>

        <form className="inline-form" onSubmit={createProject}>
          <input
            placeholder="New project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn btn-primary" disabled={creating}>Create project</button>
        </form>

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
              <table className="table" style={{ marginTop: 12, maxWidth: 640 }}>
                <thead>
                  <tr><th>Project</th><th>Deleted</th><th></th></tr>
                </thead>
                <tbody>
                  {deletedProjects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="muted">{p.deleted_at ? new Date(p.deleted_at).toLocaleString() : "--"}</td>
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
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
