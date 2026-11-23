import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, type Project } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { announce } from "../lib/announce";
import { NavIcon } from "./NavIcon";

/**
 * The phone bottom bar (v174, navigation consolidation): Today ·
 * Projects · ＋ · Sync · Menu, persistent on every signed-in screen at
 * ≤860px (CSS hides it above that width and in print). The ＋ opens an
 * action sheet -- it creates, it does not navigate: Quick-add task (the
 * same in-place add Today offers, with a project picker) and New
 * project. Menu opens the sidebar body as a sheet (AppSidebar owns that
 * state; this bar only carries the button).
 */
export function PhoneBottomBar({
  menuOpen,
  onToggleMenu,
  menuButtonRef,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [sheet, setSheet] = useState<"actions" | "quickadd" | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Leaving the page closes the sheet.
  useEffect(() => { setSheet(null); }, [pathname]);

  useEffect(() => {
    if (sheet !== "quickadd") return;
    titleRef.current?.focus();
    if (projects === null) {
      api
        .listProjects()
        .then(({ projects: list }) => {
          setProjects(list);
          if (list.length > 0) setProjectId((cur) => cur || list[0].id);
        })
        .catch(() => setProjects([]));
    }
  }, [sheet, projects]);

  useEffect(() => {
    if (!sheet) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheet(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !projectId || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.createTask(projectId, trimmed, user?.display_name ?? undefined);
      announce(`Added: ${trimmed}`);
      setTitle("");
      setSheet(null);
    } catch {
      setError("That task didn't save. Give it another try.");
    } finally {
      setAdding(false);
    }
  }

  const itemCls = (active: boolean) => (active ? "phone-bar-item active" : "phone-bar-item");
  const onProjects = pathname === "/app/projects" || pathname.startsWith("/app/projects/");

  return (
    <>
      <nav className="phone-bottom-bar" aria-label="Quick navigation">
        <Link to="/app" className={itemCls(pathname === "/app")} aria-current={pathname === "/app" ? "page" : undefined}>
          <NavIcon name="today" active={pathname === "/app"} />
          <span className="phone-bar-label">Today</span>
        </Link>
        <Link to="/app/projects" className={itemCls(onProjects)} aria-current={onProjects ? "page" : undefined}>
          <NavIcon name="dashboard" active={onProjects} />
          <span className="phone-bar-label">Projects</span>
        </Link>
        <button
          type="button"
          className="phone-bar-item phone-bar-plus"
          aria-label="Create"
          aria-expanded={sheet !== null}
          onClick={() => setSheet((s) => (s === null ? "actions" : null))}
        >
          <span className="phone-bar-plus-glyph" aria-hidden="true">+</span>
          <span className="phone-bar-label">Create</span>
        </button>
        <Link to="/app/sync" className={itemCls(pathname === "/app/sync")} aria-current={pathname === "/app/sync" ? "page" : undefined}>
          <NavIcon name="decisions" active={pathname === "/app/sync"} />
          <span className="phone-bar-label">Sync</span>
        </Link>
        <button
          type="button"
          ref={menuButtonRef}
          className="phone-bar-item"
          aria-expanded={menuOpen}
          aria-controls="sidebar-nav"
          onClick={onToggleMenu}
        >
          <NavIcon name="menu" active={menuOpen} />
          <span className="phone-bar-label">Menu</span>
        </button>
      </nav>

      {sheet && (
        <div className="phone-sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="phone-sheet" role="dialog" aria-modal="true" aria-label={sheet === "actions" ? "Create" : "Quick-add task"}>
            {sheet === "actions" ? (
              <>
                <button type="button" className="phone-sheet-item" onClick={() => setSheet("quickadd")}>
                  Quick-add task
                </button>
                <Link to="/app/projects?new=1" className="phone-sheet-item" onClick={() => setSheet(null)}>
                  New project
                </Link>
                <button type="button" className="phone-sheet-item phone-sheet-cancel" onClick={() => setSheet(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <form className="phone-quickadd" onSubmit={addTask}>
                <label className="phone-quickadd-label" htmlFor="phone-quickadd-title">Quick-add task</label>
                <input
                  id="phone-quickadd-title"
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Task title"
                  maxLength={200}
                />
                {projects === null ? (
                  <p className="muted">Loading your projects…</p>
                ) : projects.length === 0 ? (
                  <p className="muted">Create a project first, then you can quick-add tasks to it.</p>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="phone-quickadd-project">Project</label>
                    <select id="phone-quickadd-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <div className="phone-quickadd-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setSheet(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={adding || !title.trim() || !projectId}>
                    {adding ? "Adding…" : "Add task"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
