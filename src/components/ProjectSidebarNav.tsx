// v172 (Plan A, "Layer It"): the project's navigation lives in the
// sidebar now, one contextual column instead of the two stacked tab bars
// that used to sit on top of every project page. The global destinations
// stay above this in AppSidebar; this component renders only the project
// block: its name and stage, its sections in the v174 job-shaped groups
// (Plan / Track / People / Wrap up, plus the ungrouped settings tail),
// and the "More sections" grow list.
//
// Behavior is unchanged underneath: selecting a section is the same
// ?tab= navigation the pill bars used, the size system still decides
// which sections exist, and the product tour's data-tour targets moved
// here with the buttons, so every tour step still finds its element.
// Client Snapshot is the one link section: it opens the snapshot print
// route instead of a tab (it never had a ?tab= id).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NavGroup } from "./AppSidebar";
import { NavIcon, type NavIconName } from "./NavIcon";
import { api } from "../lib/api";
import type { NavGroup as NavGroupData, NavSection } from "../lib/projectNav";

export type SidebarGroup = { group: NavGroupData; sections: NavSection[]; opens: string };

export function ProjectSidebarNav({
  projectId,
  projectName,
  stageLabel,
  groups,
  activeTab,
  decisionsWaiting,
  growPieces,
  onOpenTab,
  onGrow,
}: {
  projectId: string;
  projectName: string;
  stageLabel?: string | null;
  groups: SidebarGroup[];
  activeTab: string;
  activeGroupId: string | null;
  decisionsWaiting: number;
  growPieces: { id: string; label: string }[];
  onOpenTab: (tab: string) => void;
  onGrow: (tab: string) => void;
}) {
  const [growOpen, setGrowOpen] = useState(false);
  const navigate = useNavigate();
  // Phone Menu sheet only (CSS hides this above 860px): a project
  // switcher at the top of the project's zone in the sheet.
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    api
      .listProjects()
      .then(({ projects: list }) => { if (live) setProjects(list.map((p) => ({ id: p.id, name: p.name }))); })
      .catch(() => { /* the switcher just doesn't render */ });
    return () => { live = false; };
  }, []);

  function item(sec: NavSection) {
    const active = activeTab === sec.id;
    const badge = sec.id === "decisions" && decisionsWaiting > 0 && (
      <span className="side-badge" aria-label={`${decisionsWaiting} waiting`}>
        {decisionsWaiting}
      </span>
    );
    if (sec.href) {
      return (
        <Link
          key={sec.id}
          to={sec.href(projectId)}
          className="side-tab"
          data-tour={`tab-${sec.id}`}
        >
          <NavIcon name={sec.id as NavIconName} active={false} />
          {sec.label}
          {badge}
        </Link>
      );
    }
    return (
      <button
        key={sec.id}
        type="button"
        className={active ? "side-tab active" : "side-tab"}
        aria-current={active ? "page" : undefined}
        onClick={() => onOpenTab(sec.id)}
        data-tour={`tab-${sec.id}`}
      >
        <NavIcon name={sec.id as NavIconName} active={active} />
        {sec.label}
        {badge}
      </button>
    );
  }

  return (
    <div className="side-project-block">
      <div className="side-nav-group">
        {/* The label truncates in the narrow sidebar; the full project
            name is on hover (kept from v160, F-24). */}
        <div className="side-nav-label side-project-name" title={projectName}>
          {projectName}
        </div>
        {projects.length > 1 && (
          <div className="side-project-switcher">
            <label className="sr-only" htmlFor="side-project-switch">Switch project</label>
            <select
              id="side-project-switch"
              value={projectId}
              onChange={(e) => navigate(`/app/projects/${e.target.value}`)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        {stageLabel && <div className="side-project-stage">{stageLabel} stage</div>}
      </div>

      {groups.map(({ group, sections }) =>
        group.id === "settings" ? (
          // The settings tail is ungrouped (v174): two entries at the end
          // of the list, no collapsible label of their own.
          <div className="side-nav-group" key={group.id}>
            <div className="side-nav-items">{sections.map(item)}</div>
          </div>
        ) : sections.length === 1 ? (
          <div className="side-nav-group" key={group.id}>
            <div className="side-nav-items">{item(sections[0])}</div>
          </div>
        ) : (
          <NavGroup key={group.id} label={group.label}>
            {sections.map(item)}
          </NavGroup>
        ),
      )}

      {growPieces.length > 0 && (
        <div className="side-nav-group">
          <button
            type="button"
            className="side-grow-btn"
            aria-expanded={growOpen}
            onClick={() => setGrowOpen((o) => !o)}
          >
            + More sections
          </button>
          {growOpen && (
            <div className="side-nav-items">
              {growPieces.map((piece) => (
                <button
                  key={piece.id}
                  type="button"
                  className="side-tab"
                  onClick={() => onGrow(piece.id)}
                >
                  <NavIcon name={piece.id as NavIconName} active={false} />
                  {piece.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
