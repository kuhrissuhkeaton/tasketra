// v172 (Plan A, "Layer It"): the project's navigation lives in the
// sidebar now, one contextual column instead of the two stacked tab bars
// that used to sit on top of every project page. The global Workspace
// group stays above this in AppSidebar; this component renders only the
// project block: its name and stage, its sections grouped the way
// projectNav already groups them, and (for light projects) the same
// grow-in-place row the calm home offers.
//
// Behavior is unchanged underneath: selecting a section is the same
// ?tab= navigation the pill bars used, the size system still decides
// which sections exist, and the product tour's data-tour targets moved
// here with the buttons, so every tour step still finds its element.

import { useState } from "react";
import { NavGroup } from "./AppSidebar";
import { NavIcon, type NavIconName } from "./NavIcon";
import type { NavGroup as NavGroupData, NavSection } from "../lib/projectNav";

export type SidebarGroup = { group: NavGroupData; sections: NavSection[]; opens: string };

export function ProjectSidebarNav({
  projectName,
  stageLabel,
  groups,
  activeTab,
  activeGroupId,
  decisionsWaiting,
  growPieces,
  onOpenTab,
  onGrow,
}: {
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

  function item(sec: NavSection) {
    const active = activeTab === sec.id;
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
        {sec.id === "decisions" && decisionsWaiting > 0 && (
          <span className="side-badge" aria-label={`${decisionsWaiting} waiting`}>
            {decisionsWaiting}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <div className="side-nav-group">
        {/* The label truncates in the narrow sidebar; the full project
            name is on hover (kept from v160, F-24). */}
        <div className="side-nav-label" title={projectName}>
          {projectName}
        </div>
        {stageLabel && <div className="side-project-stage">{stageLabel} stage</div>}
      </div>

      {groups.map(({ group, sections }) =>
        sections.length === 1 ? (
          <div className="side-nav-group" key={group.id}>
            <div className="side-nav-items">{item(sections[0])}</div>
          </div>
        ) : (
          <NavGroup
            key={group.id}
            label={group.label}
            defaultCollapsed={group.id !== activeGroupId && group.id === "docs"}
          >
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
            + Need more for this project?
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
    </>
  );
}
