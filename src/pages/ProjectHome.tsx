import { useEffect, useState, useRef, Fragment } from "react";
import { useParams, useSearchParams, useNavigate, useLocation, Link } from "react-router-dom";
import { api, ApiError, type Project, type Task, type Stakeholder, type Decision, type Issue, type Risk, type Assumption, type Dependency, type ChangeRequest, type Lesson, type TodayData, type WeeklyReport, type BudgetData, type FeedItem, type TrashItem, type ProjectMember, type Meeting, type MeetingActionItem, type ProjectDocument, type StorageUsage, type RoadmapItem, type RoadmapItemType, type QualityItem, type ProcurementItem, type CommPlanItem, type ComplianceItem } from "../lib/api";
import { RoadmapTimeline, ROADMAP_TYPE_LABEL, ROADMAP_STATUS_LABEL, fmtRoadmapDate } from "../components/RoadmapTimeline";
import { tasksToICS, downloadICS } from "../lib/ics";
import { fmtDate, fmtDateTime, fmtLocalDate } from "../lib/format";
import { capacityLevel, CAPACITY_LABEL, CAPACITY_PILL, type CapacityLevel } from "../lib/capacity";
import { useAuth } from "../lib/auth-context";
import { AppSidebar, NavGroup } from "../components/AppSidebar";
import { NavIcon, type NavIconName } from "../components/NavIcon";
import { useConfirm } from "../components/ConfirmDialog";
import { ResizableTable } from "../components/ResizableTable";
import { avatarColor, initials } from "../lib/avatar";
import { TourOverlay, useProductTour } from "../components/ProductTour";


export type Tab = "home" | "roadmap" | "tasks" | "raid" | "budget" | "meetings" | "documents" | "stakeholders" | "decisions" | "team" | "procurement" | "comms" | "closure" | "report" | "templates" | "export" | "connections" | "trash";

function daysAgo(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return `${Math.round(n * 100)}%`;
}

function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "--";
  return n.toFixed(2);
}

// DATE columns come back from the API as full ISO timestamps
// ("2026-08-01T00:00:00.000Z"), not bare date strings -- slicing to the
// first 10 chars before re-appending a time keeps this safe for both that
// shape and a plain "2026-08-01" string (appending straight onto an
// already-complete ISO string produces "...ZT00:00:00", which silently
// parses to Invalid Date instead of throwing).
function toLocalDate(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00`);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Flattens a parent/child task list into an ordered, indented row list (a
// pre-order tree walk) so a plain HTML table can render a WBS-style outline
// without nested <table> markup. Top-level order follows whatever order the
// API returned; each task's children are inserted immediately after it.
function buildTaskRows(tasks: Task[]): { task: Task; depth: number }[] {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parent_task_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  const rows: { task: Task; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const t of byParent.get(parentId) || []) {
      rows.push({ task: t, depth });
      walk(t.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

const STATUS_LABEL: Record<Task["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const TASK_STATUS_PILL: Record<Task["status"], string> = {
  not_started: "pill-navy",
  in_progress: "pill-gold",
  blocked: "pill-red",
  done: "pill-green",
};

const ISSUE_STATUS_LABEL: Record<Issue["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const SEVERITY_LABEL: Record<Issue["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const SEVERITY_PILL: Record<Issue["severity"], string> = {
  low: "pill-green",
  medium: "pill-gold",
  high: "pill-red",
  critical: "pill-red",
};

const RISK_STATUS_LABEL: Record<Risk["status"], string> = {
  open: "Open",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const LEVEL_LABEL: Record<Risk["probability"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function riskExposure(probability: Risk["probability"], impact: Risk["impact"]): "low" | "medium" | "high" {
  if (probability === "high" && impact === "high") return "high";
  if (probability === "high" || impact === "high") return "medium";
  if (probability === "low" && impact === "low") return "low";
  return "medium";
}

const EXPOSURE_PILL: Record<"low" | "medium" | "high", string> = {
  low: "pill-green",
  medium: "pill-gold",
  high: "pill-red",
};

// The six sections a PM actually lives in day to day -- rendered as a pill
// bar at the top of the project content area (same visual pattern as the
// List/Board/Timeline and Issues/Risks/Assumptions/Dependencies sub-tabs
// already used inside individual pages), instead of buried in the sidebar
// alongside everything else.
const PRIMARY_TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "roadmap", label: "Roadmap" },
  { id: "tasks", label: "Tasks" },
  { id: "raid", label: "Issues & risks" },
  { id: "budget", label: "Budget" },
  { id: "meetings", label: "Meetings" },
];

// Everything else stays in the sidebar, grouped into collapsible sections so
// the list doesn't read as one long undifferentiated wall of links. Each
// label names an actual category -- no "More"/"Misc" catch-alls.
const SECONDARY_NAV_GROUPS: { label: string; tabs: { id: Tab; label: string }[] }[] = [
  { label: "People & decisions", tabs: [
    { id: "stakeholders", label: "Stakeholders" },
    { id: "decisions", label: "Decisions" },
    { id: "team", label: "Team" },
    { id: "procurement", label: "Vendors" },
    { id: "comms", label: "Comms plan" },
  ] },
  { label: "Documents & output", tabs: [
    { id: "documents", label: "Documents" },
    { id: "report", label: "Weekly report" },
    { id: "templates", label: "Templates" },
    { id: "export", label: "Export" },
    { id: "connections", label: "Connections" },
    { id: "closure", label: "Closure" },
  ] },
];

export default function ProjectHome() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "home";
  const [project, setProject] = useState<Project | null>(null);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tour = useProductTour((tourTab) => setParams({ tab: tourTab }));

  useEffect(() => {
    if (id) api.getProject(id).then(({ project }) => setProject(project));
  }, [id]);

  // Started by Dashboard's first-project flow, or Resources' "Replay the
  // tour" link, both of which pass startTour via router state rather than
  // a query param (so it can't be triggered by pasting/bookmarking a URL).
  // Consumed once, then cleared from history state so back/forward
  // navigation doesn't replay it.
  useEffect(() => {
    const navState = location.state as { startTour?: boolean; forceReplay?: boolean } | null;
    if (!navState?.startTour || !id) return;
    if (navState.forceReplay || !user?.tour_completed_at) {
      tour.start();
    }
    navigate(location.pathname + location.search, { replace: true, state: null });
    // Deliberately narrow: `tour` and `navigate` are new references most
    // renders, and including them here would replay the tour or loop on
    // the state-clearing navigate() call below.
  }, [location.state, id, user]);

  if (!id) return null;

  return (
    <div className="project-shell">
      <AppSidebar>
        <div className="side-nav-group">
          <div className="side-nav-label">{project?.name || "Project"}</div>
        </div>
        {SECONDARY_NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.label}
            label={group.label}
            defaultCollapsed={!group.tabs.some((t) => t.id === tab)}
            forceExpanded={tour.active && group.tabs.some((t) => t.id === tour.step.tab)}
          >
            {group.tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "side-tab active" : "side-tab"}
                onClick={() => setParams({ tab: t.id })}
                type="button"
                data-tour={`tab-${t.id}`}
              >
                <NavIcon name={t.id as NavIconName} active={tab === t.id} />
                {t.label}
              </button>
            ))}
          </NavGroup>
        ))}
        <NavGroup label="Reference" defaultCollapsed={tab !== "trash"}>
          <button
            className={tab === "trash" ? "side-tab active" : "side-tab"}
            onClick={() => setParams({ tab: "trash" })}
            type="button"
          >
            <NavIcon name="trash" active={tab === "trash"} />
            Trash
          </button>
        </NavGroup>
      </AppSidebar>

      <main className="project-main">
        <div className="page-head">
          <h1>{project?.name || "Project"}</h1>
        </div>

        <div className="inline-form primary-tabs">
          {PRIMARY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "btn btn-primary" : "btn btn-ghost"}
              onClick={() => setParams({ tab: t.id })}
              data-tour={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "home" && <HomeTab projectId={id} />}
        {tab === "roadmap" && <RoadmapTab projectId={id} isOwner={project?.is_owner ?? false} />}
        {tab === "tasks" && <TasksTab projectId={id} projectName={project?.name || "Project"} />}
        {tab === "raid" && <RaidTab projectId={id} />}
        {tab === "budget" && <BudgetTab projectId={id} />}
        {tab === "meetings" && <MeetingsTab projectId={id} />}
        {tab === "documents" && <DocumentsTab projectId={id} />}
        {tab === "stakeholders" && <StakeholdersTab projectId={id} />}
        {tab === "decisions" && <DecisionsTab projectId={id} />}
        {tab === "team" && <TeamTab projectId={id} isOwner={project?.is_owner ?? false} />}
        {tab === "procurement" && <ProcurementTab projectId={id} />}
        {tab === "comms" && <CommsPlanTab projectId={id} />}
        {tab === "closure" && <ClosureTab projectId={id} />}
        {tab === "report" && <ReportTab projectId={id} projectName={project?.name || "Project"} />}
        {tab === "templates" && <TemplatesTab projectId={id} projectName={project?.name || "project"} />}
        {tab === "export" && <ExportTab projectId={id} projectName={project?.name || ""} />}
        {tab === "connections" && <ConnectionsTab projectId={id} />}
        {tab === "trash" && <TrashTab projectId={id} />}
      </main>

      {tour.active && (
        <TourOverlay
          step={tour.step}
          stepIndex={tour.stepIndex}
          totalSteps={tour.totalSteps}
          onNext={tour.next}
          onSkip={tour.skip}
        />
      )}
    </div>
  );
}

function HomeTab({ projectId }: { projectId: string }) {
  const [view, setView] = useState<"today" | "feed">("today");
  return (
    <div>
      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "today" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("today")}
        >
          Today
        </button>
        <button
          className={view === "feed" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("feed")}
        >
          Feed
        </button>
      </div>
      {view === "today" ? <TodayTab projectId={projectId} /> : <FeedTab projectId={projectId} />}
    </div>
  );
}

function FeedTab({ projectId }: { projectId: string }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { feed } = await api.getFeed(projectId);
    setFeed(feed);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await api.createStatusUpdate(projectId, note.trim());
    setNote("");
    load();
  }

  return (
    <div>
      <form className="inline-form" onSubmit={postNote}>
        <input placeholder="Post a status update to the feed..." value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary">Post</button>
      </form>

      {loading ? (
        <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
      ) : feed.length === 0 ? (
        <p className="muted">Nothing here yet. Add a task, request a decision, or post an update.</p>
      ) : (
        <ul className="feed">
          {feed.map((item, i) => (
            <li key={i} className={`feed-item feed-${item.type}`}>
              <div className="feed-item-head">
                <span className="feed-type">{feedLabel(item)}</span>
                <span className="feed-ts">{fmtDateTime(item.ts)}</span>
              </div>
              {item.title && <div className="feed-title">{item.title}</div>}
              <div className="feed-body">{item.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TodayTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [, setParams] = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignValue, setReassignValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function load() {
    api.getToday(projectId).then(setData);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function setTaskStatus(id: string, status: Task["status"]) {
    setBusyId(id);
    try {
      await api.updateTask(id, { status });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function setIssueStatus(id: string, status: Issue["status"]) {
    setBusyId(id);
    try {
      await api.updateIssue(id, { status });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function setRiskStatus(id: string, status: Risk["status"]) {
    setBusyId(id);
    try {
      await api.updateRisk(id, { status });
      load();
    } finally {
      setBusyId(null);
    }
  }

  function startReassign(id: string, currentOwner: string | null) {
    setReassignId(id);
    setReassignValue(currentOwner || "");
  }

  async function saveReassign(kind: "task" | "issue" | "risk", id: string) {
    setBusyId(id);
    try {
      const owner_name = reassignValue.trim() || null;
      if (kind === "task") await api.updateTask(id, { owner_name });
      else if (kind === "issue") await api.updateIssue(id, { owner_name });
      else await api.updateRisk(id, { owner_name });
      setReassignId(null);
      load();
    } finally {
      setBusyId(null);
    }
  }

  function copyDecisionLink(id: string, token: string) {
    const url = `${window.location.origin}/d/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
    });
  }

  if (!data) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  const nothingToShow =
    data.blockedTasks.length === 0 &&
    data.staleTasks.length === 0 &&
    data.awaitingDecisions.length === 0 &&
    data.urgentIssues.length === 0 &&
    data.urgentRisks.length === 0;

  return (
    <div>
      {nothingToShow && data.taskCount === 0 && (
        <div className="today-section">
          <p className="muted">
            Nothing here yet because this project is brand new. Head to the Tasks tab to add your
            first task, or Stakeholders to start your register.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => setParams({ tab: "tasks" })}
          >
            Go to Tasks
          </button>
        </div>
      )}
      {nothingToShow && data.taskCount > 0 && (
        <p className="muted">Nothing needs you right now. Clean board.</p>
      )}

      {data.blockedTasks.length > 0 && (
        <div className="today-section">
          <h4>Blocked tasks</h4>
          <ul className="today-list">
            {data.blockedTasks.map((t) => (
              <li key={t.id} className="today-list-row">
                <div>
                  <strong>{t.title}</strong> -- {t.owner_name || "unassigned"}
                  <span className="muted"> -- blocked {daysAgo(t.updated_at)}d</span>
                </div>
                {reassignId === t.id ? (
                  <div className="row-actions">
                    <input
                      value={reassignValue}
                      onChange={(e) => setReassignValue(e.target.value)}
                      placeholder="Owner"
                      style={{ width: 130 }}
                      autoFocus
                    />
                    <button className="btn-link" type="button" disabled={busyId === t.id} onClick={() => saveReassign("task", t.id)}>Save</button>
                    <button className="btn-link" type="button" onClick={() => setReassignId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <select
                      className="status-select status-select-blocked"
                      value="blocked"
                      disabled={busyId === t.id}
                      onChange={(e) => setTaskStatus(t.id, e.target.value as Task["status"])}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button className="btn-link" type="button" onClick={() => startReassign(t.id, t.owner_name)}>Reassign</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.staleTasks.length > 0 && (
        <div className="today-section">
          <h4>No movement in 3+ days</h4>
          <ul className="today-list">
            {data.staleTasks.map((t) => (
              <li key={t.id} className="today-list-row">
                <div>
                  <strong>{t.title}</strong> -- {t.owner_name || "unassigned"}
                  <span className="muted"> -- untouched {daysAgo(t.updated_at)}d</span>
                </div>
                {reassignId === t.id ? (
                  <div className="row-actions">
                    <input
                      value={reassignValue}
                      onChange={(e) => setReassignValue(e.target.value)}
                      placeholder="Owner"
                      style={{ width: 130 }}
                      autoFocus
                    />
                    <button className="btn-link" type="button" disabled={busyId === t.id} onClick={() => saveReassign("task", t.id)}>Save</button>
                    <button className="btn-link" type="button" onClick={() => setReassignId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <select
                      className={`status-select status-select-${t.status}`}
                      value={t.status}
                      disabled={busyId === t.id}
                      onChange={(e) => setTaskStatus(t.id, e.target.value as Task["status"])}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button className="btn-link" type="button" onClick={() => startReassign(t.id, t.owner_name)}>Reassign</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.awaitingDecisions.length > 0 && (
        <div className="today-section">
          <h4>Decisions waiting on a stakeholder</h4>
          <ul className="today-list">
            {data.awaitingDecisions.map((d) => (
              <li key={d.id} className="today-list-row">
                <div>
                  <strong>{d.title}</strong>
                  <span className="muted"> -- waiting {daysAgo(d.created_at)}d</span>
                  {d.recipients.length > 0 && <span className="muted"> -- sent to {d.recipients.join(", ")}</span>}
                </div>
                <div className="row-actions">
                  <button className="btn-link" type="button" onClick={() => copyDecisionLink(d.id, d.public_token)}>
                    {copiedId === d.id ? "Copied!" : "Copy link"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.urgentIssues.length > 0 && (
        <div className="today-section">
          <h4>High-severity issues still open</h4>
          <ul className="today-list">
            {data.urgentIssues.map((i) => (
              <li key={i.id} className="today-list-row">
                <div>
                  <strong>{i.title}</strong> -- {i.owner_name || "unassigned"}
                  <span className="muted"> -- {i.severity}</span>
                </div>
                {reassignId === i.id ? (
                  <div className="row-actions">
                    <input
                      value={reassignValue}
                      onChange={(e) => setReassignValue(e.target.value)}
                      placeholder="Owner"
                      style={{ width: 130 }}
                      autoFocus
                    />
                    <button className="btn-link" type="button" disabled={busyId === i.id} onClick={() => saveReassign("issue", i.id)}>Save</button>
                    <button className="btn-link" type="button" onClick={() => setReassignId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <select
                      className={`status-select status-select-${i.status}`}
                      value={i.status}
                      disabled={busyId === i.id}
                      onChange={(e) => setIssueStatus(i.id, e.target.value as Issue["status"])}
                    >
                      {Object.entries(ISSUE_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button className="btn-link" type="button" onClick={() => startReassign(i.id, i.owner_name)}>Reassign</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.urgentRisks.length > 0 && (
        <div className="today-section">
          <h4>High-exposure risks</h4>
          <ul className="today-list">
            {data.urgentRisks.map((r) => (
              <li key={r.id} className="today-list-row">
                <div>
                  <strong>{r.title}</strong> -- {r.owner_name || "unassigned"}
                  <span className="muted"> -- {r.probability} probability / {r.impact} impact</span>
                </div>
                {reassignId === r.id ? (
                  <div className="row-actions">
                    <input
                      value={reassignValue}
                      onChange={(e) => setReassignValue(e.target.value)}
                      placeholder="Owner"
                      style={{ width: 130 }}
                      autoFocus
                    />
                    <button className="btn-link" type="button" disabled={busyId === r.id} onClick={() => saveReassign("risk", r.id)}>Save</button>
                    <button className="btn-link" type="button" onClick={() => setReassignId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <select
                      className={`status-select status-select-${r.status}`}
                      value={r.status}
                      disabled={busyId === r.id}
                      onChange={(e) => setRiskStatus(r.id, e.target.value as Risk["status"])}
                    >
                      {Object.entries(RISK_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button className="btn-link" type="button" onClick={() => startReassign(r.id, r.owner_name)}>Reassign</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function feedLabel(item: FeedItem) {
  switch (item.type) {
    case "status_update": return "Status update";
    case "task": return "Task";
    case "decision_request": return "Decision requested";
    case "decision_record": return "Decision recorded";
    case "issue": return "Issue";
    case "risk": return "Risk";
    case "activity": {
      const entityType = String(item.meta?.entityType || "item");
      const action = String(item.meta?.action || "changed");
      const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
      return `${entityLabel} ${action}`;
    }
  }
}

const TRASH_ENTITY_LABEL: Record<TrashItem["entity_type"], string> = {
  task: "Task",
  issue: "Issue",
  risk: "Risk",
  stakeholder: "Stakeholder",
  decision: "Decision",
  assumption: "Assumption",
  dependency: "Dependency",
  change_request: "Change request",
  lesson: "Lesson",
  meeting: "Meeting",
  document: "Document",
  roadmap_item: "Roadmap item",
  quality_item: "Quality item",
  procurement_item: "Vendor / procurement item",
  comm_plan_item: "Comms plan item",
  compliance_item: "Compliance item",
};

function TrashTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { items } = await api.getTrash(projectId);
    setItems(items);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function restore(item: TrashItem) {
    setRestoringId(item.id);
    await api.restoreItem(item.entity_type, item.id);
    await load();
    setRestoringId(null);
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Deleted tasks, issues, risks, assumptions, dependencies, change requests, lessons, stakeholders, decisions, meetings, documents, and roadmap items land here. Restore them any time -- nothing is gone for good.
      </p>

      {loading ? (
        <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
      ) : items.length === 0 ? (
        <p className="muted">Trash is empty.</p>
      ) : (
        <ResizableTable id="trash">
          <thead>
            <tr><th>Item</th><th>Type</th><th>Deleted</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.entity_type}-${item.id}`}>
                <td>{item.title || "(untitled)"}</td>
                <td><span className="pill pill-navy">{TRASH_ENTITY_LABEL[item.entity_type]}</span></td>
                <td className="muted">{fmtDateTime(item.deleted_at)}</td>
                <td className="row-actions">
                  <button
                    className="btn-link"
                    type="button"
                    disabled={restoringId === item.id}
                    onClick={() => restore(item)}
                  >
                    {restoringId === item.id ? "Restoring..." : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </ResizableTable>
      )}
    </div>
  );
}

function TasksTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const confirmDialog = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [newStatus, setNewStatus] = useState<Task["status"]>("not_started");
  const [view, setView] = useState<"list" | "board" | "timeline">("list");
  const [dragOverStatus, setDragOverStatus] = useState<Task["status"] | null>(null);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subTitle, setSubTitle] = useState("");
  const [subOwner, setSubOwner] = useState("");
  const [subStart, setSubStart] = useState("");
  const [subDue, setSubDue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDue, setEditDue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { tasks } = await api.listTasks(projectId);
    setTasks(tasks);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createTask(projectId, title.trim(), owner || undefined, due || undefined, undefined, start || undefined, newStatus);
      setTitle("");
      setOwner("");
      setStart("");
      setDue("");
      setNewStatus("not_started");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't add that task.");
    }
  }

  async function addSubtask(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (!subTitle.trim()) return;
    await api.createTask(projectId, subTitle.trim(), subOwner || undefined, subDue || undefined, parentId, subStart || undefined);
    setSubTitle("");
    setSubOwner("");
    setSubStart("");
    setSubDue("");
    setAddingSubtaskFor(null);
    load();
  }

  async function setStatus(taskId: string, status: Task["status"]) {
    await api.updateTask(taskId, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: Task["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) setStatus(taskId, status);
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditOwner(t.owner_name || "");
    setEditStart(t.start_date || "");
    setEditDue(t.due_date || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateTask(id, {
      title: editTitle.trim(), owner_name: editOwner || undefined,
      start_date: editStart || undefined, due_date: editDue || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeTask(id: string, label: string) {
    if (!(await confirmDialog(`Delete task "${label}"? Sub-tasks will be deleted too. You can restore from Trash.`))) return;
    await api.deleteTask(id);
    load();
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <form className="inline-form inline-form-wide" onSubmit={addTask}>
        <input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input type="date" title="Start date (optional)" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" title="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Task["status"])} title="Status">
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button className="btn btn-primary">Add task</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
        <button
          className={view === "timeline" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("timeline")}
        >
          Timeline
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => downloadICS(tasksToICS(tasks, projectName), `${projectName || "tasketra"}-tasks.ics`)}
        >
          Export due dates (.ics)
        </button>
      </div>

      {view === "list" ? (
        <ResizableTable id="tasks">
          <thead>
            <tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {buildTaskRows(tasks).map(({ task: t, depth }) => (
              <Fragment key={t.id}>
                {editingId === t.id ? (
                  <tr>
                    <td style={{ paddingLeft: depth * 20 }}>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </td>
                    <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} placeholder="Owner" /></td>
                    <td>
                      <input type="date" title="Start date" value={editStart} onChange={(e) => setEditStart(e.target.value)} style={{ marginBottom: 4 }} />
                      <input type="date" title="Due date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                    </td>
                    <td><span className={`pill ${TASK_STATUS_PILL[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
                    <td className="row-actions">
                      <button className="btn btn-primary" type="button" onClick={() => saveEdit(t.id)}>Save</button>
                      <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>
                      <span className="wbs-cell" style={{ paddingLeft: depth * 20 }}>
                        {depth > 0 && <span className="wbs-connector">&#8627;</span>}
                        {t.title}
                      </span>
                      <button
                        className="wbs-add-btn"
                        type="button"
                        title="Add sub-task"
                        onClick={() => setAddingSubtaskFor(addingSubtaskFor === t.id ? null : t.id)}
                      >
                        +
                      </button>
                    </td>
                    <td>{t.owner_name || "--"}</td>
                    <td>{t.due_date ? fmtLocalDate(t.due_date) : "--"}</td>
                    <td>
                      <select
                        className={`status-select status-select-${t.status}`}
                        value={t.status}
                        onChange={(e) => setStatus(t.id, e.target.value as Task["status"])}
                      >
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="row-actions">
                      <button className="btn-link" type="button" onClick={() => startEdit(t)}>Edit</button>
                      <button className="btn-link btn-link-danger" type="button" onClick={() => removeTask(t.id, t.title)}>Delete</button>
                    </td>
                  </tr>
                )}
                {addingSubtaskFor === t.id && (
                  <tr>
                    <td colSpan={5}>
                      <form
                        className="inline-form inline-form-wide"
                        style={{ marginLeft: (depth + 1) * 20, marginBottom: 0 }}
                        onSubmit={(e) => addSubtask(e, t.id)}
                      >
                        <input placeholder="Sub-task title" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} autoFocus />
                        <input placeholder="Owner (optional)" value={subOwner} onChange={(e) => setSubOwner(e.target.value)} />
                        <input type="date" title="Start date (optional)" value={subStart} onChange={(e) => setSubStart(e.target.value)} />
                        <input type="date" title="Due date" value={subDue} onChange={(e) => setSubDue(e.target.value)} />
                        <button className="btn btn-primary">Add</button>
                        <button className="btn btn-ghost" type="button" onClick={() => setAddingSubtaskFor(null)}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {tasks.length === 0 && (
              <tr><td colSpan={5} className="muted">No tasks yet. Add one above to get started.</td></tr>
            )}
          </tbody>
        </ResizableTable>
      ) : view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(STATUS_LABEL) as Task["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {STATUS_LABEL[status]}
                <span className="kanban-column-count">{tasks.filter((t) => t.status === status).length}</span>
              </div>
              {tasks.filter((t) => t.status === status).map((t) => {
                const parent = t.parent_task_id ? taskById.get(t.parent_task_id) : null;
                return (
                  <div
                    key={t.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  >
                    {parent && <div className="kanban-parent muted">&#8627; {parent.title}</div>}
                    <div>{t.title}</div>
                    <div className="muted">{t.owner_name || "unassigned"}{t.due_date ? ` -- ${fmtLocalDate(t.due_date)}` : ""}</div>
                  </div>
                );
              })}
              {tasks.filter((t) => t.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop tasks here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <TimelineView tasks={tasks} />
      )}
    </div>
  );
}

function TimelineView({ tasks }: { tasks: Task[] }) {
  const dated = tasks.filter((t) => t.due_date);
  if (dated.length === 0) {
    return <p className="muted">Add due dates to your tasks to see them on the timeline.</p>;
  }

  const rows = buildTaskRows(tasks).filter((r) => r.task.due_date);

  const times = dated.flatMap((t) => [
    toLocalDate(t.start_date || t.due_date!).getTime(),
    toLocalDate(t.due_date!).getTime(),
  ]);
  const minDate = new Date(Math.min(...times));
  const maxDate = new Date(Math.max(...times));
  minDate.setDate(minDate.getDate() - 2);
  maxDate.setDate(maxDate.getDate() + 2);

  const totalDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / 86400000));
  const pxPerDay = 24;
  const trackWidth = totalDays * pxPerDay;

  function dayOffset(dateStr: string) {
    return Math.round((toLocalDate(dateStr).getTime() - minDate.getTime()) / 86400000);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOffset = dayOffset(todayStr);

  const weekTicks: { offset: number; label: string }[] = [];
  for (let d = 0; d <= totalDays; d += 7) {
    const tickDate = new Date(minDate.getTime() + d * 86400000);
    weekTicks.push({ offset: d, label: tickDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
  }

  return (
    <div>
      <div className="gantt-wrap">
        <div className="gantt-labels">
          <div className="gantt-header-spacer" />
          {rows.map(({ task: t, depth }) => (
            <div key={t.id} className="gantt-label-row" style={{ paddingLeft: 10 + depth * 16 }} title={t.title}>
              {depth > 0 && <span className="wbs-connector">&#8627;</span>}
              {t.title}
            </div>
          ))}
        </div>
        <div className="gantt-track-wrap">
          <div style={{ width: trackWidth, position: "relative" }}>
            <div className="gantt-header" style={{ width: trackWidth }}>
              {weekTicks.map((tick) => (
                <div key={tick.offset} className="gantt-header-tick" style={{ left: tick.offset * pxPerDay }}>
                  {tick.label}
                </div>
              ))}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <div className="gantt-header-tick gantt-header-tick-today" style={{ left: todayOffset * pxPerDay }}>
                  Today
                </div>
              )}
            </div>
            {rows.map(({ task: t }) => {
              const startOffset = dayOffset(t.start_date || t.due_date!);
              const endOffset = dayOffset(t.due_date!);
              const left = Math.min(startOffset, endOffset) * pxPerDay;
              const width = Math.max(Math.abs(endOffset - startOffset) * pxPerDay, 8);
              return (
                <div key={t.id} className="gantt-row" style={{ width: trackWidth }}>
                  <div
                    className={`gantt-bar gantt-bar-${t.status}`}
                    style={{ left, width }}
                    title={`${t.title}: ${fmtLocalDate(t.start_date || t.due_date)} → ${fmtLocalDate(t.due_date)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="gantt-legend">
        <span><span className="gantt-swatch gantt-bar-not_started" /> Not started</span>
        <span><span className="gantt-swatch gantt-bar-in_progress" /> In progress</span>
        <span><span className="gantt-swatch gantt-bar-blocked" /> Blocked</span>
        <span><span className="gantt-swatch gantt-bar-done" /> Done</span>
      </div>
    </div>
  );
}

function RaidTab({ projectId }: { projectId: string }) {
  const [view, setView] = useState<"issues" | "risks" | "assumptions" | "dependencies" | "quality" | "compliance">("issues");
  const VIEWS: { id: typeof view; label: string }[] = [
    { id: "issues", label: "Issues" },
    { id: "risks", label: "Risks" },
    { id: "assumptions", label: "Assumptions" },
    { id: "dependencies", label: "Dependencies" },
    { id: "quality", label: "Quality" },
    { id: "compliance", label: "Compliance" },
  ];
  return (
    <div>
      <div className="inline-form" style={{ marginBottom: 16 }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={view === v.id ? "btn btn-primary" : "btn btn-ghost"}
            type="button"
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "issues" && <IssuesTab projectId={projectId} />}
      {view === "risks" && <RisksTab projectId={projectId} />}
      {view === "assumptions" && <AssumptionsTab projectId={projectId} />}
      {view === "dependencies" && <DependenciesTab projectId={projectId} />}
      {view === "quality" && <QualityTab projectId={projectId} />}
      {view === "compliance" && <ComplianceTab projectId={projectId} />}
    </div>
  );
}

function IssuesTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Issue["severity"]>("medium");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<Issue["status"]>("open");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<Issue["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSeverity, setEditSeverity] = useState<Issue["severity"]>("medium");
  const [editOwner, setEditOwner] = useState("");
  const [editResolution, setEditResolution] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { issues } = await api.listIssues(projectId);
    setIssues(issues);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createIssue(projectId, title.trim(), description || undefined, severity, owner || undefined, newStatus);
      setTitle("");
      setDescription("");
      setSeverity("medium");
      setOwner("");
      setNewStatus("open");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that issue.");
    }
  }

  async function setStatus(issueId: string, status: Issue["status"]) {
    await api.updateIssue(issueId, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: Issue["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const issueId = e.dataTransfer.getData("text/plain");
    if (issueId) setStatus(issueId, status);
  }

  function startEdit(i: Issue) {
    setEditingId(i.id);
    setEditTitle(i.title);
    setEditDescription(i.description || "");
    setEditSeverity(i.severity);
    setEditOwner(i.owner_name || "");
    setEditResolution(i.resolution || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateIssue(id, {
      title: editTitle.trim(), description: editDescription || undefined,
      severity: editSeverity, owner_name: editOwner || undefined,
      resolution: editResolution || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeIssue(id: string, label: string) {
    if (!(await confirmDialog(`Delete issue "${label}"? You can restore it from Trash.`))) return;
    await api.deleteIssue(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <form className="stacked-form" onSubmit={addIssue}>
        <label>Issue</label>
        <input placeholder="What's the issue?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Issue["severity"])}>
            {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label} severity</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Issue["status"])} title="Status">
            {Object.entries(ISSUE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary">Log issue</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(ISSUE_STATUS_LABEL) as Issue["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {ISSUE_STATUS_LABEL[status]}
                <span className="kanban-column-count">{issues.filter((i) => i.status === status).length}</span>
              </div>
              {issues.filter((i) => i.status === status).map((i) => (
                <div
                  key={i.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                >
                  <span className={`pill ${SEVERITY_PILL[i.severity]}`} style={{ marginBottom: 6, display: "inline-block" }}>
                    {SEVERITY_LABEL[i.severity]}
                  </span>
                  <div>{i.title}</div>
                  <div className="muted">{i.owner_name || "unassigned"}</div>
                </div>
              ))}
              {issues.filter((i) => i.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop issues here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-issues">
        <thead>
          <tr><th>Issue</th><th>Severity</th><th>Owner</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            editingId === i.id ? (
              <tr key={i.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                </td>
                <td>
                  <select value={editSeverity} onChange={(e) => setEditSeverity(e.target.value as Issue["severity"])}>
                    {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td className="muted">
                  {ISSUE_STATUS_LABEL[i.status]}
                  <input
                    value={editResolution} onChange={(e) => setEditResolution(e.target.value)}
                    placeholder="Resolution" style={{ marginTop: 4 }}
                  />
                </td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(i.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={i.id}>
                <td>
                  {i.title}
                  {i.status === "resolved" && i.resolution && (
                    <div className="muted">Resolved: {i.resolution}</div>
                  )}
                </td>
                <td><span className={`pill ${SEVERITY_PILL[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span></td>
                <td>{i.owner_name || "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${i.status}`}
                    value={i.status}
                    onChange={(e) => setStatus(i.id, e.target.value as Issue["status"])}
                  >
                    {Object.entries(ISSUE_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(i)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeIssue(i.id, i.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {issues.length === 0 && (
            <tr><td colSpan={5} className="muted">No issues logged. Nice.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}

function RisksTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState<Risk["probability"]>("medium");
  const [impact, setImpact] = useState<Risk["impact"]>("medium");
  const [mitigation, setMitigation] = useState("");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<Risk["status"]>("open");
  const [view, setView] = useState<"list" | "board" | "matrix">("list");
  const [dragOverStatus, setDragOverStatus] = useState<Risk["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProbability, setEditProbability] = useState<Risk["probability"]>("medium");
  const [editImpact, setEditImpact] = useState<Risk["impact"]>("medium");
  const [editMitigation, setEditMitigation] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { risks } = await api.listRisks(projectId);
    setRisks(risks);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addRisk(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createRisk(projectId, title.trim(), description || undefined, probability, impact, mitigation || undefined, owner || undefined, newStatus);
      setTitle("");
      setDescription("");
      setProbability("medium");
      setImpact("medium");
      setMitigation("");
      setOwner("");
      setNewStatus("open");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that risk.");
    }
  }

  async function setStatus(riskId: string, status: Risk["status"]) {
    await api.updateRisk(riskId, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: Risk["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const riskId = e.dataTransfer.getData("text/plain");
    if (riskId) setStatus(riskId, status);
  }

  function startEdit(r: Risk) {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditDescription(r.description || "");
    setEditProbability(r.probability);
    setEditImpact(r.impact);
    setEditMitigation(r.mitigation || "");
    setEditOwner(r.owner_name || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateRisk(id, {
      title: editTitle.trim(), description: editDescription || undefined, probability: editProbability,
      impact: editImpact, mitigation: editMitigation || undefined, owner_name: editOwner || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeRisk(id: string, label: string) {
    if (!(await confirmDialog(`Delete risk "${label}"? You can restore it from Trash.`))) return;
    await api.deleteRisk(id);
    load();
  }

  // "Recognize when a risk becomes an issue" (PMI) -- one action that
  // creates the matching Issue with the risk's details carried over, and
  // marks the Risk resolved, instead of a PM having to do both by hand.
  async function promoteToIssue(r: Risk) {
    if (!(await confirmDialog(`Turn risk "${r.title}" into an issue? This creates a new issue with the same details and marks the risk resolved.`))) return;
    const exposure = riskExposure(r.probability, r.impact);
    const description = ["Promoted from a risk.", r.description, r.mitigation ? `Planned mitigation: ${r.mitigation}` : null]
      .filter(Boolean)
      .join("\n\n");
    try {
      await api.createIssue(projectId, r.title, description || undefined, exposure, r.owner_name || undefined);
      await api.updateRisk(r.id, { status: "resolved" });
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't turn that risk into an issue.");
    }
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <form className="stacked-form" onSubmit={addRisk}>
        <label>Risk</label>
        <input placeholder="What could go wrong?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <label>Mitigation plan (optional)</label>
        <textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={probability} onChange={(e) => setProbability(e.target.value as Risk["probability"])}>
            {Object.entries(LEVEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label} probability</option>
            ))}
          </select>
          <select value={impact} onChange={(e) => setImpact(e.target.value as Risk["impact"])}>
            {Object.entries(LEVEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label} impact</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Risk["status"])} title="Status">
            {Object.entries(RISK_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary">Log risk</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
        <button
          className={view === "matrix" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("matrix")}
        >
          Matrix
        </button>
      </div>

      {view === "matrix" ? (
        <div>
          <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Open and monitoring risks only, placed by probability and impact. Exposure (low/medium/high)
            is the same read used everywhere else in RAID.
          </p>
          <div className="risk-matrix-wrap">
            <div className="risk-matrix-axis-y">Impact</div>
            <div className="risk-matrix">
              <div className="risk-matrix-corner" />
              {(["low", "medium", "high"] as Risk["probability"][]).map((p) => (
                <div key={p} className="risk-matrix-col-label">{LEVEL_LABEL[p]}</div>
              ))}
              {(["high", "medium", "low"] as Risk["impact"][]).map((impact) => (
                <Fragment key={impact}>
                  <div className="risk-matrix-row-label">{LEVEL_LABEL[impact]}</div>
                  {(["low", "medium", "high"] as Risk["probability"][]).map((probability) => {
                    const cellRisks = risks.filter((r) => r.status !== "resolved" && r.probability === probability && r.impact === impact);
                    const exposure = riskExposure(probability, impact);
                    return (
                      <div key={probability} className={`risk-matrix-cell risk-matrix-cell-${exposure}`}>
                        <div className="risk-matrix-cell-count">{cellRisks.length}</div>
                        {cellRisks.slice(0, 4).map((r) => (
                          <div key={r.id} className="risk-matrix-chip" title={r.title}>{r.title}</div>
                        ))}
                        {cellRisks.length > 4 && <div className="risk-matrix-chip muted">+{cellRisks.length - 4} more</div>}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="risk-matrix-axis-x">Probability</div>
        </div>
      ) : view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(RISK_STATUS_LABEL) as Risk["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {RISK_STATUS_LABEL[status]}
                <span className="kanban-column-count">{risks.filter((r) => r.status === status).length}</span>
              </div>
              {risks.filter((r) => r.status === status).map((r) => {
                const exposure = riskExposure(r.probability, r.impact);
                return (
                  <div
                    key={r.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                  >
                    <span className={`pill ${EXPOSURE_PILL[exposure]}`} style={{ marginBottom: 6, display: "inline-block" }}>
                      {LEVEL_LABEL[exposure]} exposure
                    </span>
                    <div>{r.title}</div>
                    <div className="muted">{r.owner_name || "unassigned"}</div>
                    {r.status !== "resolved" && (
                      <button className="btn-link" type="button" onClick={() => promoteToIssue(r)} style={{ marginTop: 6 }}>
                        This became an issue &rarr;
                      </button>
                    )}
                  </div>
                );
              })}
              {risks.filter((r) => r.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop risks here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-risks">
        <thead>
          <tr><th>Risk</th><th>Exposure</th><th>Owner</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {risks.map((r) => (
            editingId === r.id ? (
              <tr key={r.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" style={{ marginBottom: 4 }} />
                  <textarea value={editMitigation} onChange={(e) => setEditMitigation(e.target.value)} rows={2} placeholder="Mitigation" />
                </td>
                <td>
                  <select value={editProbability} onChange={(e) => setEditProbability(e.target.value as Risk["probability"])} style={{ marginBottom: 4 }}>
                    {Object.entries(LEVEL_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label} probability</option>
                    ))}
                  </select>
                  <select value={editImpact} onChange={(e) => setEditImpact(e.target.value as Risk["impact"])}>
                    {Object.entries(LEVEL_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label} impact</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td className="muted">{RISK_STATUS_LABEL[r.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(r.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>
                  {r.title}
                  {r.mitigation && <div className="muted">Mitigation: {r.mitigation}</div>}
                </td>
                <td>
                  <span className={`pill ${EXPOSURE_PILL[riskExposure(r.probability, r.impact)]}`}>
                    {LEVEL_LABEL[riskExposure(r.probability, r.impact)]}
                  </span>
                </td>
                <td>{r.owner_name || "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${r.status}`}
                    value={r.status}
                    onChange={(e) => setStatus(r.id, e.target.value as Risk["status"])}
                  >
                    {Object.entries(RISK_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(r)}>Edit</button>
                  {r.status !== "resolved" && (
                    <button className="btn-link" type="button" onClick={() => promoteToIssue(r)}>This became an issue</button>
                  )}
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeRisk(r.id, r.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {risks.length === 0 && (
            <tr><td colSpan={5} className="muted">No risks logged yet. Add one above if something's worth tracking.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}

const ASSUMPTION_STATUS_LABEL: Record<Assumption["status"], string> = {
  unconfirmed: "Unconfirmed",
  confirmed: "Confirmed",
  invalidated: "Invalidated",
};

function AssumptionsTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [statement, setStatement] = useState("");
  const [notes, setNotes] = useState("");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<Assumption["status"]>("unconfirmed");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<Assumption["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatement, setEditStatement] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { assumptions } = await api.listAssumptions(projectId);
    setAssumptions(assumptions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addAssumption(e: React.FormEvent) {
    e.preventDefault();
    if (!statement.trim()) return;
    setError("");
    try {
      await api.createAssumption(projectId, statement.trim(), notes || undefined, owner || undefined, newStatus);
      setStatement("");
      setNotes("");
      setOwner("");
      setNewStatus("unconfirmed");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that assumption.");
    }
  }

  async function setStatus(id: string, status: Assumption["status"]) {
    await api.updateAssumption(id, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: Assumption["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const assumptionId = e.dataTransfer.getData("text/plain");
    if (assumptionId) setStatus(assumptionId, status);
  }

  function startEdit(a: Assumption) {
    setEditingId(a.id);
    setEditStatement(a.statement);
    setEditNotes(a.notes || "");
    setEditOwner(a.owner_name || "");
  }

  async function saveEdit(id: string) {
    if (!editStatement.trim()) return;
    await api.updateAssumption(id, {
      statement: editStatement.trim(), notes: editNotes || undefined, owner_name: editOwner || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeAssumption(id: string, label: string) {
    if (!(await confirmDialog(`Delete assumption "${label}"? You can restore it from Trash.`))) return;
    await api.deleteAssumption(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Things you're treating as true for planning purposes. Write them down so the plan gets
        revisited if one turns out wrong.
      </p>
      <form className="stacked-form" onSubmit={addAssumption}>
        <label>Assumption</label>
        <input placeholder="What are you assuming is true?" value={statement} onChange={(e) => setStatement(e.target.value)} />
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Assumption["status"])} title="Status">
            {Object.entries(ASSUMPTION_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary">Log assumption</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(ASSUMPTION_STATUS_LABEL) as Assumption["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {ASSUMPTION_STATUS_LABEL[status]}
                <span className="kanban-column-count">{assumptions.filter((a) => a.status === status).length}</span>
              </div>
              {assumptions.filter((a) => a.status === status).map((a) => (
                <div
                  key={a.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                >
                  <div>{a.statement}</div>
                  <div className="muted">{a.owner_name || "unassigned"}</div>
                </div>
              ))}
              {assumptions.filter((a) => a.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop assumptions here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-assumptions">
        <thead>
          <tr><th>Assumption</th><th>Owner</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {assumptions.map((a) => (
            editingId === a.id ? (
              <tr key={a.id}>
                <td>
                  <input value={editStatement} onChange={(e) => setEditStatement(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Notes" />
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td className="muted">{ASSUMPTION_STATUS_LABEL[a.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(a.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={a.id}>
                <td>
                  {a.statement}
                  {a.notes && <div className="muted">{a.notes}</div>}
                </td>
                <td>{a.owner_name || "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${a.status}`}
                    value={a.status}
                    onChange={(e) => setStatus(a.id, e.target.value as Assumption["status"])}
                  >
                    {Object.entries(ASSUMPTION_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(a)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeAssumption(a.id, a.statement)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {assumptions.length === 0 && (
            <tr><td colSpan={4} className="muted">No assumptions logged yet. Add one above to track what you're taking for granted.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}
const DEPENDENCY_STATUS_LABEL: Record<Dependency["status"], string> = {
  blocked: "Waiting",
  in_progress: "In progress",
  resolved: "Cleared",
};

const DEPENDENCY_DIRECTION_LABEL: Record<Dependency["direction"], string> = {
  internal: "Internal",
  external: "External",
};

function DependenciesTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<Dependency["direction"]>("internal");
  const [owner, setOwner] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [newStatus, setNewStatus] = useState<Dependency["status"]>("blocked");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<Dependency["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDirection, setEditDirection] = useState<Dependency["direction"]>("internal");
  const [editOwner, setEditOwner] = useState("");
  const [editNeededBy, setEditNeededBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { dependencies } = await api.listDependencies(projectId);
    setDependencies(dependencies);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addDependency(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createDependency(projectId, title.trim(), description || undefined, direction, owner || undefined, neededBy || undefined, newStatus);
      setTitle("");
      setDescription("");
      setDirection("internal");
      setOwner("");
      setNeededBy("");
      setNewStatus("blocked");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that dependency.");
    }
  }

  async function setStatus(id: string, status: Dependency["status"]) {
    await api.updateDependency(id, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: Dependency["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const dependencyId = e.dataTransfer.getData("text/plain");
    if (dependencyId) setStatus(dependencyId, status);
  }

  function startEdit(d: Dependency) {
    setEditingId(d.id);
    setEditTitle(d.title);
    setEditDescription(d.description || "");
    setEditDirection(d.direction);
    setEditOwner(d.owner_name || "");
    setEditNeededBy(d.needed_by || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateDependency(id, {
      title: editTitle.trim(), description: editDescription || undefined, direction: editDirection,
      owner_name: editOwner || undefined, needed_by: editNeededBy || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeDependency(id: string, label: string) {
    if (!(await confirmDialog(`Delete dependency "${label}"? You can restore it from Trash.`))) return;
    await api.deleteDependency(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Work that can't start or finish until something else does -- internal (another task) or
        external (a vendor, client, or regulatory step).
      </p>
      <form className="stacked-form" onSubmit={addDependency}>
        <label>Dependency</label>
        <input placeholder="What's this waiting on?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={direction} onChange={(e) => setDirection(e.target.value as Dependency["direction"])}>
            {Object.entries(DEPENDENCY_DIRECTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Dependency["status"])} title="Status">
            {Object.entries(DEPENDENCY_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary">Log dependency</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(DEPENDENCY_STATUS_LABEL) as Dependency["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {DEPENDENCY_STATUS_LABEL[status]}
                <span className="kanban-column-count">{dependencies.filter((d) => d.status === status).length}</span>
              </div>
              {dependencies.filter((d) => d.status === status).map((d) => (
                <div
                  key={d.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {DEPENDENCY_DIRECTION_LABEL[d.direction]}
                  </span>
                  <div>{d.title}</div>
                  <div className="muted">
                    {d.owner_name || "unassigned"}{d.needed_by ? ` -- ${fmtLocalDate(d.needed_by)}` : ""}
                  </div>
                </div>
              ))}
              {dependencies.filter((d) => d.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop dependencies here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-dependencies">
        <thead>
          <tr><th>Dependency</th><th>Direction</th><th>Owner</th><th>Needed by</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {dependencies.map((d) => (
            editingId === d.id ? (
              <tr key={d.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                </td>
                <td>
                  <select value={editDirection} onChange={(e) => setEditDirection(e.target.value as Dependency["direction"])}>
                    {Object.entries(DEPENDENCY_DIRECTION_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td><input type="date" value={editNeededBy} onChange={(e) => setEditNeededBy(e.target.value)} /></td>
                <td className="muted">{DEPENDENCY_STATUS_LABEL[d.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(d.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={d.id}>
                <td>
                  {d.title}
                  {d.description && <div className="muted">{d.description}</div>}
                </td>
                <td><span className="pill pill-navy">{DEPENDENCY_DIRECTION_LABEL[d.direction]}</span></td>
                <td>{d.owner_name || "--"}</td>
                <td>{fmtLocalDate(d.needed_by)}</td>
                <td>
                  <select
                    className={`status-select status-select-${d.status}`}
                    value={d.status}
                    onChange={(e) => setStatus(d.id, e.target.value as Dependency["status"])}
                  >
                    {Object.entries(DEPENDENCY_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(d)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeDependency(d.id, d.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {dependencies.length === 0 && (
            <tr><td colSpan={6} className="muted">No dependencies logged yet. Add one above if this project is waiting on something.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}
const QUALITY_CATEGORY_LABEL: Record<QualityItem["category"], string> = {
  standard: "Standard",
  review: "Review",
  defect: "Defect",
};

const QUALITY_STATUS_LABEL: Record<QualityItem["status"], string> = {
  open: "Open",
  in_progress: "In review",
  passed: "Passed",
  failed: "Failed",
};

function QualityTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<QualityItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<QualityItem["category"]>("review");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<QualityItem["status"]>("open");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<QualityItem["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<QualityItem["category"]>("review");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { qualityItems } = await api.listQuality(projectId);
    setItems(qualityItems);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createQuality(projectId, title.trim(), description || undefined, category, owner || undefined, newStatus);
      setTitle("");
      setDescription("");
      setCategory("review");
      setOwner("");
      setNewStatus("open");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that quality item.");
    }
  }

  async function setStatus(id: string, status: QualityItem["status"]) {
    await api.updateQuality(id, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: QualityItem["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setStatus(itemId, status);
  }

  function startEdit(q: QualityItem) {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditDescription(q.description || "");
    setEditCategory(q.category);
    setEditOwner(q.owner_name || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateQuality(id, {
      title: editTitle.trim(), description: editDescription || undefined, category: editCategory, owner_name: editOwner || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Delete quality item "${label}"? You can restore it from Trash.`))) return;
    await api.deleteQuality(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Standards to meet, reviews to run, and defects you've found -- a quality log alongside
        the rest of RAID, since "is this good enough" is a different question from "is something
        broken."
      </p>
      <form className="stacked-form" onSubmit={addItem}>
        <label>Quality item</label>
        <input placeholder="What needs to meet a bar, or get reviewed?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value as QualityItem["category"])}>
            {Object.entries(QUALITY_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as QualityItem["status"])} title="Status">
            {Object.entries(QUALITY_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="btn btn-primary">Log quality item</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(QUALITY_STATUS_LABEL) as QualityItem["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {QUALITY_STATUS_LABEL[status]}
                <span className="kanban-column-count">{items.filter((q) => q.status === status).length}</span>
              </div>
              {items.filter((q) => q.status === status).map((q) => (
                <div
                  key={q.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", q.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {QUALITY_CATEGORY_LABEL[q.category]}
                  </span>
                  <div>{q.title}</div>
                  <div className="muted">{q.owner_name || "unassigned"}</div>
                </div>
              ))}
              {items.filter((q) => q.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop quality items here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-quality">
        <thead>
          <tr><th>Quality item</th><th>Category</th><th>Owner</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((q) => (
            editingId === q.id ? (
              <tr key={q.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                </td>
                <td>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as QualityItem["category"])}>
                    {Object.entries(QUALITY_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td className="muted">{QUALITY_STATUS_LABEL[q.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(q.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={q.id}>
                <td>
                  {q.title}
                  {q.description && <div className="muted">{q.description}</div>}
                </td>
                <td><span className="pill pill-navy">{QUALITY_CATEGORY_LABEL[q.category]}</span></td>
                <td>{q.owner_name || "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${q.status}`}
                    value={q.status}
                    onChange={(e) => setStatus(q.id, e.target.value as QualityItem["status"])}
                  >
                    {Object.entries(QUALITY_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(q)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeItem(q.id, q.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="muted">No quality items logged yet. Add a standard to meet, a review to run, or a defect you found.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}
const COMPLIANCE_CATEGORY_LABEL: Record<ComplianceItem["category"], string> = {
  regulatory: "Regulatory",
  policy: "Policy",
  standard: "Standard",
  contractual: "Contractual",
};

const COMPLIANCE_STATUS_LABEL: Record<ComplianceItem["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  compliant: "Compliant",
  non_compliant: "Non-compliant",
};

function ComplianceTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComplianceItem["category"]>("regulatory");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<ComplianceItem["status"]>("not_started");
  const [dueDate, setDueDate] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<ComplianceItem["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<ComplianceItem["category"]>("regulatory");
  const [editOwner, setEditOwner] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { complianceItems } = await api.listCompliance(projectId);
    setItems(complianceItems);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createCompliance(projectId, title.trim(), description || undefined, category, owner || undefined, newStatus, dueDate || undefined);
      setTitle("");
      setDescription("");
      setCategory("regulatory");
      setOwner("");
      setNewStatus("not_started");
      setDueDate("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that compliance item.");
    }
  }

  async function setStatus(id: string, status: ComplianceItem["status"]) {
    await api.updateCompliance(id, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: ComplianceItem["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setStatus(itemId, status);
  }

  function startEdit(c: ComplianceItem) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditDescription(c.description || "");
    setEditCategory(c.category);
    setEditOwner(c.owner_name || "");
    setEditDueDate(c.due_date || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateCompliance(id, {
      title: editTitle.trim(), description: editDescription || undefined, category: editCategory,
      owner_name: editOwner || undefined, due_date: editDueDate || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Delete compliance item "${label}"? You can restore it from Trash.`))) return;
    await api.deleteCompliance(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Regulatory, policy, standard, or contractual obligations this project needs to satisfy --
        tracked alongside the rest of RAID, since "are we compliant with this" is a different
        question from "is this good enough" (Quality) or "is something broken" (Issues).
      </p>
      <form className="stacked-form" onSubmit={addItem}>
        <label>Compliance item</label>
        <input placeholder="What regulation, policy, or standard applies here?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value as ComplianceItem["category"])}>
            {Object.entries(COMPLIANCE_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ComplianceItem["status"])} title="Status">
            {Object.entries(COMPLIANCE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input type="date" title="Due date (optional)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button className="btn btn-primary">Log compliance item</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(COMPLIANCE_STATUS_LABEL) as ComplianceItem["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {COMPLIANCE_STATUS_LABEL[status]}
                <span className="kanban-column-count">{items.filter((c) => c.status === status).length}</span>
              </div>
              {items.filter((c) => c.status === status).map((c) => (
                <div
                  key={c.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {COMPLIANCE_CATEGORY_LABEL[c.category]}
                  </span>
                  <div>{c.title}</div>
                  <div className="muted">{c.owner_name || "unassigned"}{c.due_date ? ` -- due ${fmtLocalDate(c.due_date)}` : ""}</div>
                </div>
              ))}
              {items.filter((c) => c.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop compliance items here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="raid-compliance">
        <thead>
          <tr><th>Compliance item</th><th>Category</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            editingId === c.id ? (
              <tr key={c.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                </td>
                <td>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ComplianceItem["category"])}>
                    {Object.entries(COMPLIANCE_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td><input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></td>
                <td className="muted">{COMPLIANCE_STATUS_LABEL[c.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>
                  {c.title}
                  {c.description && <div className="muted">{c.description}</div>}
                </td>
                <td><span className="pill pill-navy">{COMPLIANCE_CATEGORY_LABEL[c.category]}</span></td>
                <td>{c.owner_name || "--"}</td>
                <td>{c.due_date ? fmtLocalDate(c.due_date) : "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${c.status}`}
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value as ComplianceItem["status"])}
                  >
                    {Object.entries(COMPLIANCE_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeItem(c.id, c.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">No compliance items logged yet. Add a regulation, policy, or standard this project needs to satisfy.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}

const FREQUENCY_LABEL: Record<CommPlanItem["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  milestone: "At milestones",
  as_needed: "As needed",
};

const CHANNEL_LABEL: Record<CommPlanItem["channel"], string> = {
  email: "Email",
  meeting: "Meeting",
  chat: "Chat",
  report: "Report",
  other: "Other",
};

function CommsPlanTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<CommPlanItem[]>([]);
  const [audience, setAudience] = useState("");
  const [topic, setTopic] = useState("");
  const [frequency, setFrequency] = useState<CommPlanItem["frequency"]>("weekly");
  const [channel, setChannel] = useState<CommPlanItem["channel"]>("email");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAudience, setEditAudience] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editFrequency, setEditFrequency] = useState<CommPlanItem["frequency"]>("weekly");
  const [editChannel, setEditChannel] = useState<CommPlanItem["channel"]>("email");
  const [editOwner, setEditOwner] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { commPlanItems } = await api.listCommPlan(projectId);
    setItems(commPlanItems);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!audience.trim() || !topic.trim()) return;
    setError("");
    try {
      await api.createCommPlanItem(projectId, audience.trim(), topic.trim(), frequency, channel, owner || undefined, notes || undefined);
      setAudience("");
      setTopic("");
      setFrequency("weekly");
      setChannel("email");
      setOwner("");
      setNotes("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't add that to the plan.");
    }
  }

  function startEdit(item: CommPlanItem) {
    setEditingId(item.id);
    setEditAudience(item.audience);
    setEditTopic(item.topic);
    setEditFrequency(item.frequency);
    setEditChannel(item.channel);
    setEditOwner(item.owner_name || "");
    setEditNotes(item.notes || "");
  }

  async function saveEdit(id: string) {
    if (!editAudience.trim() || !editTopic.trim()) return;
    await api.updateCommPlanItem(id, {
      audience: editAudience.trim(), topic: editTopic.trim(), frequency: editFrequency, channel: editChannel,
      owner_name: editOwner || undefined, notes: editNotes || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Remove "${label}" from the communications plan? You can restore it from Trash.`))) return;
    await api.deleteCommPlanItem(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Who needs what information, how often, and by what channel -- a reference plan rather than
        a tracked workflow, so entries don't have a status; edit or remove one when the arrangement
        changes.
      </p>
      <form className="stacked-form" onSubmit={addItem}>
        <label>Audience</label>
        <input placeholder="Who needs this information? (a stakeholder, a group, the sponsor...)" value={audience} onChange={(e) => setAudience(e.target.value)} />
        <label>What they need</label>
        <input placeholder="Status update, budget summary, milestone report..." value={topic} onChange={(e) => setTopic(e.target.value)} />
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as CommPlanItem["frequency"])}>
            {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={channel} onChange={(e) => setChannel(e.target.value as CommPlanItem["channel"])}>
            {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <button className="btn btn-primary">Add to plan</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <ResizableTable id="comms-plan">
        <thead>
          <tr><th>Audience</th><th>What they need</th><th>Frequency</th><th>Channel</th><th>Owner</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            editingId === item.id ? (
              <tr key={item.id}>
                <td><input value={editAudience} onChange={(e) => setEditAudience(e.target.value)} /></td>
                <td>
                  <input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Notes" />
                </td>
                <td>
                  <select value={editFrequency} onChange={(e) => setEditFrequency(e.target.value as CommPlanItem["frequency"])}>
                    {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={editChannel} onChange={(e) => setEditChannel(e.target.value as CommPlanItem["channel"])}>
                    {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={item.id}>
                <td>{item.audience}</td>
                <td>
                  {item.topic}
                  {item.notes && <div className="muted">{item.notes}</div>}
                </td>
                <td><span className="pill pill-navy">{FREQUENCY_LABEL[item.frequency]}</span></td>
                <td>{CHANNEL_LABEL[item.channel]}</td>
                <td>{item.owner_name || "--"}</td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(item)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeItem(item.id, `${item.audience}: ${item.topic}`)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">No communications plan yet. Add a row for who needs to hear what, and how often.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

const PROCUREMENT_CATEGORY_LABEL: Record<ProcurementItem["category"], string> = {
  vendor: "Vendor",
  contract: "Contract",
  purchase_order: "Purchase order",
};

const PROCUREMENT_STATUS_LABEL: Record<ProcurementItem["status"], string> = {
  requested: "Requested",
  in_progress: "Sourcing",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

function ProcurementTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProcurementItem["category"]>("vendor");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<ProcurementItem["status"]>("requested");
  const [cost, setCost] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<ProcurementItem["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVendorName, setEditVendorName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<ProcurementItem["category"]>("vendor");
  const [editOwner, setEditOwner] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { procurementItems } = await api.listProcurement(projectId);
    setItems(procurementItems);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorName.trim()) return;
    setError("");
    try {
      await api.createProcurement(
        projectId, vendorName.trim(), description || undefined, category, owner || undefined,
        newStatus, cost.trim() ? Number(cost) : null, startDate || undefined, endDate || undefined,
      );
      setVendorName("");
      setDescription("");
      setCategory("vendor");
      setOwner("");
      setNewStatus("requested");
      setCost("");
      setStartDate("");
      setEndDate("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that vendor.");
    }
  }

  async function setStatus(id: string, status: ProcurementItem["status"]) {
    await api.updateProcurement(id, { status });
    load();
  }

  function onDropOnColumn(e: React.DragEvent, status: ProcurementItem["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setStatus(itemId, status);
  }

  function startEdit(p: ProcurementItem) {
    setEditingId(p.id);
    setEditVendorName(p.vendor_name);
    setEditDescription(p.description || "");
    setEditCategory(p.category);
    setEditOwner(p.owner_name || "");
    setEditCost(p.cost === null ? "" : String(p.cost));
    setEditStartDate(p.start_date || "");
    setEditEndDate(p.end_date || "");
  }

  async function saveEdit(id: string) {
    if (!editVendorName.trim()) return;
    await api.updateProcurement(id, {
      vendor_name: editVendorName.trim(),
      description: editDescription || undefined,
      category: editCategory,
      owner_name: editOwner || undefined,
      cost: editCost.trim() ? Number(editCost) : null,
      start_date: editStartDate || undefined,
      end_date: editEndDate || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Delete "${label}"? You can restore it from Trash.`))) return;
    await api.deleteProcurement(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Who you're buying from or contracting with, what it costs, and where it stands -- tracked
        the same way as the rest of RAID, since "do we have an agreement with this vendor" is a
        different question from "is this task done."
      </p>
      <form className="stacked-form" onSubmit={addItem}>
        <label>Vendor or contract</label>
        <input placeholder="Who are you buying from, or what's the agreement?" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value as ProcurementItem["category"])}>
            {Object.entries(PROCUREMENT_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ProcurementItem["status"])} title="Status">
            {Object.entries(PROCUREMENT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <input type="number" step="0.01" placeholder="Cost (optional)" value={cost} onChange={(e) => setCost(e.target.value)} style={{ maxWidth: 140 }} />
          <input type="date" title="Start date (optional)" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" title="End date (optional)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className="btn btn-primary">Log vendor</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(PROCUREMENT_STATUS_LABEL) as ProcurementItem["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {PROCUREMENT_STATUS_LABEL[status]}
                <span className="kanban-column-count">{items.filter((p) => p.status === status).length}</span>
              </div>
              {items.filter((p) => p.status === status).map((p) => (
                <div
                  key={p.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {PROCUREMENT_CATEGORY_LABEL[p.category]}
                  </span>
                  <div>{p.vendor_name}</div>
                  <div className="muted">{p.owner_name || "unassigned"}{p.cost !== null ? ` -- ${fmtMoney(p.cost)}` : ""}</div>
                </div>
              ))}
              {items.filter((p) => p.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop vendors here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <ResizableTable id="procurement-vendors">
        <thead>
          <tr><th>Vendor / contract</th><th>Category</th><th>Owner</th><th>Cost</th><th>Dates</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((p) => (
            editingId === p.id ? (
              <tr key={p.id}>
                <td>
                  <input value={editVendorName} onChange={(e) => setEditVendorName(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                </td>
                <td>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ProcurementItem["category"])}>
                    {Object.entries(PROCUREMENT_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td><input type="number" step="0.01" value={editCost} onChange={(e) => setEditCost(e.target.value)} style={{ maxWidth: 100 }} /></td>
                <td>
                  <input type="date" title="Start date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={{ marginBottom: 4 }} />
                  <input type="date" title="End date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
                </td>
                <td className="muted">{PROCUREMENT_STATUS_LABEL[p.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(p.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>
                  {p.vendor_name}
                  {p.description && <div className="muted">{p.description}</div>}
                </td>
                <td><span className="pill pill-navy">{PROCUREMENT_CATEGORY_LABEL[p.category]}</span></td>
                <td>{p.owner_name || "--"}</td>
                <td>{p.cost !== null ? fmtMoney(p.cost) : "--"}</td>
                <td className="muted">
                  {p.start_date || p.end_date
                    ? `${p.start_date ? fmtLocalDate(p.start_date) : "?"} -- ${p.end_date ? fmtLocalDate(p.end_date) : "?"}`
                    : "--"}
                </td>
                <td>
                  <select
                    className={`status-select status-select-${p.status}`}
                    value={p.status}
                    onChange={(e) => setStatus(p.id, e.target.value as ProcurementItem["status"])}
                  >
                    {Object.entries(PROCUREMENT_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeItem(p.id, p.vendor_name)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} className="muted">No vendors or contracts logged yet. Add one above when you're sourcing or have an agreement in place.</td></tr>
          )}
        </tbody>
      </ResizableTable>
      )}
    </div>
  );
}

function BudgetTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<BudgetData | null>(null);
  const [bacInput, setBacInput] = useState("");
  const [reserveInput, setReserveInput] = useState("");
  const [editingBac, setEditingBac] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredDate, setIncurredDate] = useState("");

  async function load() {
    const d = await api.getBudget(projectId);
    setData(d);
    setBacInput(d.budgetAtCompletion !== null ? String(d.budgetAtCompletion) : "");
    setReserveInput(d.contingencyReserve !== null ? String(d.contingencyReserve) : "");
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function saveBac(e: React.FormEvent) {
    e.preventDefault();
    const bacValue = bacInput.trim() === "" ? null : Number(bacInput);
    if (bacValue !== null && (Number.isNaN(bacValue) || bacValue < 0)) return;
    const reserveValue = reserveInput.trim() === "" ? null : Number(reserveInput);
    if (reserveValue !== null && (Number.isNaN(reserveValue) || reserveValue < 0)) return;
    await api.setBudget(projectId, bacValue, reserveValue);
    setEditingBac(false);
    load();
  }

  async function addCost(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!desc.trim() || Number.isNaN(value) || value <= 0) return;
    await api.addCostEntry(projectId, desc.trim(), value, incurredDate || undefined);
    setDesc("");
    setAmount("");
    setIncurredDate("");
    load();
  }

  if (!data) return <p className="muted">Loading budget...</p>;

  const { metrics, taskStats, costEntries, budgetAtCompletion, contingencyReserve } = data;
  const favorable = (n: number | null, goodIsPositive = true) =>
    n === null ? "" : (goodIsPositive ? n >= 0 : n >= 1) ? "evm-good" : "evm-bad";

  return (
    <div>
      <div className="evm-baseline">
        {editingBac || budgetAtCompletion === null ? (
          <form className="inline-form" onSubmit={saveBac}>
            <input
              placeholder="Total approved budget (BAC), e.g. 50000"
              value={bacInput}
              onChange={(e) => setBacInput(e.target.value)}
              type="number" min="0" step="0.01"
            />
            <input
              placeholder="Contingency reserve (optional), e.g. 5000"
              value={reserveInput}
              onChange={(e) => setReserveInput(e.target.value)}
              type="number" min="0" step="0.01"
              title="Money set aside for known risks -- tracked separately from BAC, not counted in the EVM metrics below."
            />
            <button className="btn btn-primary">Save budget</button>
            {budgetAtCompletion !== null && (
              <button className="btn btn-ghost" type="button" onClick={() => setEditingBac(false)}>Cancel</button>
            )}
          </form>
        ) : (
          <div className="stat-row">
            <div className="stat"><strong>{fmtMoney(budgetAtCompletion)}</strong> approved budget (BAC)</div>
            {contingencyReserve !== null && (
              <div className="stat"><strong>{fmtMoney(contingencyReserve)}</strong> contingency reserve</div>
            )}
            <button className="btn btn-ghost" type="button" onClick={() => setEditingBac(true)}>Edit</button>
          </div>
        )}
      </div>

      {taskStats.totalTasks === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>Add tasks with due dates to compute schedule-based metrics (PV, SPI, SV).</p>
      )}

      <div className="evm-grid">
        <div className="evm-card" title="Planned Value: % of tasks due by today x BAC">
          <div className="evm-label">PV</div>
          <div className="evm-value">{fmtMoney(metrics.pv)}</div>
          <div className="evm-sub">{fmtPct(metrics.pvPercent)} of scope due</div>
        </div>
        <div className="evm-card" title="Earned Value: % of tasks completed x BAC">
          <div className="evm-label">EV</div>
          <div className="evm-value">{fmtMoney(metrics.ev)}</div>
          <div className="evm-sub">{fmtPct(metrics.evPercent)} complete</div>
        </div>
        <div className="evm-card" title="Actual Cost: sum of logged cost entries">
          <div className="evm-label">AC</div>
          <div className="evm-value">{fmtMoney(metrics.ac)}</div>
          <div className="evm-sub">{costEntries.length} logged {costEntries.length === 1 ? "entry" : "entries"}</div>
        </div>
        <div className={`evm-card ${favorable(metrics.cv)}`} title="Cost Variance: EV - AC. Positive is under budget.">
          <div className="evm-label">CV</div>
          <div className="evm-value">{fmtMoney(metrics.cv)}</div>
          <div className="evm-sub">{metrics.cv === null ? "--" : metrics.cv >= 0 ? "Under budget" : "Over budget"}</div>
        </div>
        <div className={`evm-card ${favorable(metrics.sv)}`} title="Schedule Variance: EV - PV. Positive is ahead of schedule.">
          <div className="evm-label">SV</div>
          <div className="evm-value">{fmtMoney(metrics.sv)}</div>
          <div className="evm-sub">{metrics.sv === null ? "--" : metrics.sv >= 0 ? "Ahead of schedule" : "Behind schedule"}</div>
        </div>
        <div className={`evm-card ${favorable(metrics.cpi, false)}`} title="Cost Performance Index: EV / AC. Above 1.0 is efficient.">
          <div className="evm-label">CPI</div>
          <div className="evm-value">{fmtRatio(metrics.cpi)}</div>
          <div className="evm-sub">Cost efficiency</div>
        </div>
        <div className={`evm-card ${favorable(metrics.spi, false)}`} title="Schedule Performance Index: EV / PV. Above 1.0 is ahead of pace.">
          <div className="evm-label">SPI</div>
          <div className="evm-value">{fmtRatio(metrics.spi)}</div>
          <div className="evm-sub">Schedule pace</div>
        </div>
        <div className="evm-card" title="Estimate at Completion: BAC / CPI. Projected final cost at current efficiency.">
          <div className="evm-label">EAC</div>
          <div className="evm-value">{fmtMoney(metrics.eac)}</div>
          <div className="evm-sub">Forecast final cost</div>
        </div>
        <div className={`evm-card ${favorable(metrics.vac)}`} title="Variance at Completion: BAC - EAC. Positive means finishing under budget.">
          <div className="evm-label">VAC</div>
          <div className="evm-value">{fmtMoney(metrics.vac)}</div>
          <div className="evm-sub">Projected variance</div>
        </div>
        <div className="evm-card" title="To-Complete Performance Index: efficiency required on remaining work to land on budget.">
          <div className="evm-label">TCPI</div>
          <div className="evm-value">{fmtRatio(metrics.tcpi)}</div>
          <div className="evm-sub">Required efficiency</div>
        </div>
      </div>

      <h4 style={{ marginTop: 28 }}>Log actual cost</h4>
      <form className="inline-form inline-form-wide" onSubmit={addCost}>
        <input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input placeholder="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input type="date" value={incurredDate} onChange={(e) => setIncurredDate(e.target.value)} />
        <button className="btn btn-primary">Add cost</button>
      </form>

      <ResizableTable id="budget">
        <thead>
          <tr><th>Description</th><th>Amount</th><th>Date</th></tr>
        </thead>
        <tbody>
          {costEntries.map((c) => (
            <tr key={c.id}>
              <td>{c.description}</td>
              <td>{fmtMoney(Number(c.amount))}</td>
              <td>{c.incurred_date}</td>
            </tr>
          ))}
          {costEntries.length === 0 && (
            <tr><td colSpan={3} className="muted">No costs logged yet. Add one above to start tracking spend.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

const MEETING_TYPE_LABEL: Record<Meeting["meeting_type"], string> = {
  kickoff: "Kickoff",
  status: "Status",
  steering: "Steering",
  retro: "Retro",
  ccb_review: "CCB review",
  other: "Other",
};

const MEETING_TEMPLATES: Record<Meeting["meeting_type"], string> = {
  kickoff: "Objectives & success criteria:\n\nScope (in / out):\n\nRoles & responsibilities:\n\nKey milestones:\n\nCommunication plan:\n\nRisks & assumptions to flag early:",
  status: "Progress since last update:\n\nBlockers:\n\nUpcoming milestones:\n\nDecisions needed:\n\nBudget / schedule health:",
  steering: "Executive summary:\n\nKey decisions needed from this group:\n\nRisks & issues escalated:\n\nBudget / schedule status:\n\nNext steps:",
  retro: "What went well:\n\nWhat went poorly:\n\nAction items for next iteration:",
  ccb_review: "Change requests under review:\n\nImpact assessment (schedule / budget / scope):\n\nBoard discussion notes:\n\nDecisions:",
  other: "",
};

function RoadmapTab({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [type, setType] = useState<RoadmapItemType>("milestone");
  const [title, setTitle] = useState("");
  const [swimlane, setSwimlane] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<RoadmapItem["status"]>("not_started");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<RoadmapItemType>("milestone");
  const [editTitle, setEditTitle] = useState("");
  const [editSwimlane, setEditSwimlane] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState<RoadmapItem["status"]>("not_started");
  const [editDescription, setEditDescription] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  async function load() {
    setLoading(true);
    const { items } = await api.listRoadmapItems(projectId);
    setItems(items);
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]);
  useEffect(() => {
    if (isOwner) api.getProject(projectId).then(({ project }) => setProject(project));
  }, [projectId, isOwner]);

  const swimlaneNames = Array.from(new Set(items.map((i) => i.swimlane))).sort();

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createRoadmapItem(projectId, {
        type,
        title: title.trim(),
        swimlane: swimlane.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        description: description.trim() || undefined,
        status,
      });
      setTitle(""); setSwimlane(""); setStartDate(""); setEndDate(""); setDescription(""); setType("milestone"); setStatus("not_started");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that item.");
    }
  }

  function startEdit(item: RoadmapItem) {
    if (editingId === item.id) { setEditingId(null); return; }
    setEditingId(item.id);
    setEditType(item.type);
    setEditTitle(item.title);
    setEditSwimlane(item.swimlane);
    setEditStart(item.start_date || "");
    setEditEnd(item.end_date || "");
    setEditStatus(item.status);
    setEditDescription(item.description || "");
  }

  // Clicking a bar/marker in the chart jumps straight to that item's row in
  // the table below and opens its edit form -- the chart itself stays
  // read-only (no drag-to-reschedule), this just closes the gap between
  // "I can see it on the timeline" and "I have to go hunt for it in the
  // table to actually edit it."
  function selectFromChart(item: RoadmapItem) {
    startEdit(item);
    requestAnimationFrame(() => {
      rowRefs.current.get(item.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function saveEdit(id: string) {
    await api.updateRoadmapItem(id, {
      type: editType,
      title: editTitle.trim(),
      swimlane: editSwimlane.trim() || "General",
      startDate: editStart || null,
      endDate: editEnd || null,
      status: editStatus,
      description: editDescription,
    });
    setEditingId(null);
    load();
  }

  async function setItemStatus(id: string, status: RoadmapItem["status"]) {
    await api.updateRoadmapItem(id, { status });
    load();
  }

  async function removeItem(item: RoadmapItem) {
    if (!(await confirmDialog(`Delete "${item.title}"? You can restore it from Trash.`))) return;
    await api.deleteRoadmapItem(item.id);
    load();
  }

  async function toggleShare() {
    if (!project) return;
    const next = !project.roadmap_share_enabled;
    setShareBusy(true);
    try {
      const { project: updated } = await api.setProjectRoadmapShareEnabled(projectId, next);
      setProject(updated);
    } finally {
      setShareBusy(false);
    }
  }

  async function regenerateLink() {
    if (!(await confirmDialog("Generate a new link? The old link will stop working right away."))) return;
    setShareBusy(true);
    try {
      const { project: updated } = await api.regenerateRoadmapShareToken(projectId);
      setProject(updated);
    } finally {
      setShareBusy(false);
    }
  }

  function copyLink() {
    if (!project?.roadmap_share_token) return;
    const url = `${window.location.origin}/r/${project.roadmap_share_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 20, maxWidth: 640 }}>
        The strategic view of this project -- phases, milestones, releases, events, and notes, grouped
        into swimlanes and laid out on a timeline. For day-to-day execution, use the Tasks tab.
      </p>

      <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} type="button">
        {showForm ? "Cancel" : "New roadmap item"}
      </button>

      {showForm && (
        <form className="stacked-form" onSubmit={addItem} style={{ marginTop: 16 }}>
          <label>Title</label>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="inline-form" style={{ marginTop: 8 }}>
            <select value={type} onChange={(e) => setType(e.target.value as RoadmapItemType)}>
              {Object.entries(ROADMAP_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input
              list="roadmap-swimlane-options"
              placeholder="Swimlane (e.g. Platform)"
              value={swimlane}
              onChange={(e) => setSwimlane(e.target.value)}
            />
            <datalist id="roadmap-swimlane-options">
              {swimlaneNames.map((s) => <option key={s} value={s} />)}
            </datalist>
            <input type="date" title="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" title="End date (optional)" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <select value={status} onChange={(e) => setStatus(e.target.value as RoadmapItem["status"])} title="Status">
              {Object.entries(ROADMAP_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label>Notes (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-primary">Add to roadmap</button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      <div style={{ marginTop: 28 }}>
        <RoadmapTimeline items={items} onSelect={selectFromChart} />
      </div>

      <div style={{ marginTop: 28 }}>
        <ResizableTable id="roadmap-list">
        <thead>
          <tr><th>Item</th><th>Type</th><th>Swimlane</th><th>Dates</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <tr ref={(el) => { if (el) rowRefs.current.set(item.id, el); else rowRefs.current.delete(item.id); }}>
                <td>{item.title}</td>
                <td><span className="pill pill-navy">{ROADMAP_TYPE_LABEL[item.type]}</span></td>
                <td className="muted">{item.swimlane}</td>
                <td className="muted">
                  {item.start_date
                    ? `${fmtRoadmapDate(item.start_date)}${item.end_date ? ` -- ${fmtRoadmapDate(item.end_date)}` : ""}`
                    : "Undated"}
                </td>
                <td>
                  <select
                    className={`status-select status-select-${item.status}`}
                    value={item.status}
                    onChange={(e) => setItemStatus(item.id, e.target.value as RoadmapItem["status"])}
                  >
                    {Object.entries(ROADMAP_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(item)}>
                    {editingId === item.id ? "Close" : "Edit"}
                  </button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeItem(item)}>Delete</button>
                </td>
              </tr>
              {editingId === item.id && (
                <tr>
                  <td colSpan={6}>
                    <div className="settings-card" style={{ margin: "6px 0 14px" }}>
                      <label>Title</label>
                      <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      <div className="inline-form" style={{ marginTop: 8 }}>
                        <select value={editType} onChange={(e) => setEditType(e.target.value as RoadmapItemType)}>
                          {Object.entries(ROADMAP_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input value={editSwimlane} onChange={(e) => setEditSwimlane(e.target.value)} placeholder="Swimlane" />
                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as RoadmapItem["status"])}>
                          {Object.entries(ROADMAP_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div className="inline-form" style={{ marginTop: 8 }}>
                        <input type="date" title="Start date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                        <input type="date" title="End date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                      </div>
                      <label style={{ marginTop: 8 }}>Notes</label>
                      <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-primary" type="button" onClick={() => saveEdit(item.id)}>Save</button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">No roadmap items yet. Add phases, milestones, releases, events, or notes above to sketch out the plan.</td></tr>
          )}
        </tbody>
        </ResizableTable>
      </div>

      {isOwner && (
        <div className="template-card" style={{ maxWidth: 640, marginTop: 28 }}>
          <h4>Share roadmap</h4>
          <p className="muted">
            Turn this on to get a read-only link for exec sponsors or stakeholders -- no Tasketra account needed.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={!!project?.roadmap_share_enabled} disabled={shareBusy} onChange={toggleShare} />
            Sharing is {project?.roadmap_share_enabled ? "on" : "off"}
          </label>
          {project?.roadmap_share_enabled && project?.roadmap_share_token && (
            <div className="inline-form" style={{ marginTop: 10, marginBottom: 0 }}>
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/r/${project.roadmap_share_token}`}
                onFocus={(e) => e.target.select()}
                style={{ flex: 1, minWidth: 260 }}
              />
              <button className="btn btn-primary" type="button" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
              <button className="btn-link" type="button" disabled={shareBusy} onClick={regenerateLink}>Generate new link</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingsTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<Meeting["meeting_type"]>("status");
  const [meetingDate, setMeetingDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editAttendees, setEditAttendees] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [convertingItemId, setConvertingItemId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { meetings } = await api.listMeetings(projectId);
    setMeetings(meetings);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createMeeting(projectId, title.trim(), meetingType, meetingDate || undefined, attendees || undefined, notes || undefined);
      setTitle("");
      setMeetingDate("");
      setAttendees("");
      setNotes("");
      setMeetingType("status");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that meeting.");
    }
  }

  function expand(m: Meeting) {
    if (expandedId === m.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.id);
    setEditNotes(m.notes || "");
    setEditAttendees(m.attendees || "");
    setNewItemText("");
  }

  async function saveDetail(m: Meeting) {
    await api.updateMeeting(m.id, { notes: editNotes, attendees: editAttendees });
    load();
  }

  async function addActionItem(m: Meeting) {
    if (!newItemText.trim()) return;
    const item: MeetingActionItem = { id: crypto.randomUUID(), text: newItemText.trim(), done: false };
    const nextItems = [...(m.action_items || []), item];
    setNewItemText("");
    await api.updateMeeting(m.id, { action_items: nextItems });
    load();
  }

  async function toggleActionItem(m: Meeting, itemId: string) {
    const nextItems = (m.action_items || []).map((it) => (it.id === itemId ? { ...it, done: !it.done } : it));
    await api.updateMeeting(m.id, { action_items: nextItems });
    load();
  }

  async function convertToTask(m: Meeting, item: MeetingActionItem) {
    setConvertingItemId(item.id);
    try {
      const { task } = await api.createTask(projectId, item.text);
      const nextItems = (m.action_items || []).map((it) => (it.id === item.id ? { ...it, taskId: task.id } : it));
      await api.updateMeeting(m.id, { action_items: nextItems });
      load();
    } finally {
      setConvertingItemId(null);
    }
  }

  async function removeMeeting(m: Meeting) {
    if (!(await confirmDialog(`Delete meeting "${m.title}"? You can restore it from Trash.`))) return;
    await api.deleteMeeting(m.id);
    if (expandedId === m.id) setExpandedId(null);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        A record of the meetings that actually drive a project -- who was there, what was decided,
        and action items that carry straight into Tasks so nothing gets lost between the call and the work.
      </p>

      <form className="stacked-form" onSubmit={addMeeting}>
        <label>Meeting</label>
        <input placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="inline-form" style={{ marginTop: 8 }}>
          <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as Meeting["meeting_type"])}>
            {Object.entries(MEETING_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input type="date" title="Meeting date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          <input placeholder="Attendees (optional)" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          <button
            type="button"
            className="btn-link"
            onClick={() => setNotes(MEETING_TEMPLATES[meetingType])}
          >
            Use {MEETING_TYPE_LABEL[meetingType]} template
          </button>
        </div>
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-primary">Log meeting</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <ResizableTable id="meetings" style={{ marginTop: 20 }}>
        <thead>
          <tr><th>Meeting</th><th>Type</th><th>Date</th><th>Action items</th><th></th></tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <Fragment key={m.id}>
              <tr>
                <td>{m.title}</td>
                <td><span className="pill pill-navy">{MEETING_TYPE_LABEL[m.meeting_type]}</span></td>
                <td className="muted">{fmtLocalDate(m.meeting_date)}</td>
                <td className="muted">
                  {m.action_items?.length
                    ? `${m.action_items.filter((it) => it.done).length}/${m.action_items.length} done`
                    : "--"}
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => expand(m)}>
                    {expandedId === m.id ? "Close" : "View"}
                  </button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeMeeting(m)}>Delete</button>
                </td>
              </tr>
              {expandedId === m.id && (
                <tr>
                  <td colSpan={5}>
                    <div className="settings-card" style={{ margin: "6px 0 14px" }}>
                      <label>Attendees</label>
                      <input value={editAttendees} onChange={(e) => setEditAttendees(e.target.value)} placeholder="Who was there" />
                      <label>Notes</label>
                      <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={6} />
                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-primary" type="button" onClick={() => saveDetail(m)}>Save</button>
                      </div>

                      <p className="settings-card-label" style={{ marginTop: 20 }}>Action items</p>
                      <div className="checkbox-list">
                        {(m.action_items || []).map((item) => (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="checkbox" checked={item.done} onChange={() => toggleActionItem(m, item.id)} />
                            <span style={{ flex: 1, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--slate-2)" : "inherit" }}>
                              {item.text}
                            </span>
                            {item.taskId ? (
                              <span className="pill pill-green">Sent to Tasks</span>
                            ) : (
                              <button
                                className="btn-link"
                                type="button"
                                disabled={convertingItemId === item.id}
                                onClick={() => convertToTask(m, item)}
                              >
                                {convertingItemId === item.id ? "Sending..." : "Send to Tasks"}
                              </button>
                            )}
                          </div>
                        ))}
                        {(!m.action_items || m.action_items.length === 0) && (
                          <p className="muted" style={{ margin: 0 }}>No action items yet.</p>
                        )}
                      </div>
                      <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
                        <input
                          placeholder="Add an action item"
                          value={newItemText}
                          onChange={(e) => setNewItemText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addActionItem(m); } }}
                        />
                        <button className="btn btn-ghost" type="button" onClick={() => addActionItem(m)}>Add</button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {meetings.length === 0 && (
            <tr><td colSpan={5} className="muted">No meetings logged yet. Add one above to start a record.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_DOC_EXT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp";

// Storage is scoped to the project owner's account (shared across everyone
// on the project, not per-viewer) -- see billing.ts storageUsedBytes(). The
// bar turns gold past 80% used and red once the cap is hit, matching the
// pattern used for other soft/hard limit warnings in the app.
function StorageMeter({ storage }: { storage: StorageUsage }) {
  const pct = storage.capBytes > 0 ? Math.min(100, (storage.usedBytes / storage.capBytes) * 100) : 0;
  const atCap = storage.usedBytes >= storage.capBytes;
  const nearCap = pct >= 80;
  const fillColor = atCap ? "var(--red)" : nearCap ? "var(--gold)" : "var(--navy)";

  return (
    <div style={{ maxWidth: 360, marginBottom: 16 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>Storage</span>
        <span>{fmtBytes(storage.usedBytes)} of {fmtBytes(storage.capBytes)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: fillColor, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      {atCap && (
        <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          Storage limit reached. <Link to="/app/billing">Upgrade to Pro</Link> for more room, or delete some files.
        </p>
      )}
    </div>
  );
}

function DocumentsTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  async function load() {
    setLoading(true);
    const { documents, storage } = await api.listDocuments(projectId);
    setDocuments(documents);
    setStorage(storage);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUpgradeRequired(false);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Files are limited to 5MB.");
      return;
    }
    setUploading(true);
    try {
      await api.uploadDocument(projectId, file);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.upgradeRequired) setUpgradeRequired(true);
      setError(err instanceof Error ? err.message : "Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(doc: ProjectDocument) {
    if (!(await confirmDialog(`Delete "${doc.filename}"? You can restore it from Trash.`))) return;
    await api.deleteDocument(doc.id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Reference material for this project -- specs, contracts, and other documentation you need close at hand.
        PDF, Word, Excel, and image files up to 5MB. To update a document, delete the old copy and upload the new one.
      </p>

      {storage && <StorageMeter storage={storage} />}

      <div className="inline-form">
        <label className="btn btn-primary" style={{ cursor: uploading ? "default" : "pointer" }}>
          {uploading ? "Uploading..." : "Upload document"}
          <input
            type="file"
            accept={ACCEPTED_DOC_EXT}
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {error && (
        <p className="form-error">
          {error}
          {upgradeRequired && (
            <>
              {" "}
              <Link to="/app/billing">Upgrade to Pro</Link>
            </>
          )}
        </p>
      )}

      <ResizableTable id="documents" style={{ marginTop: 20 }}>
        <thead>
          <tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded by</th><th>Uploaded</th><th></th></tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const ext = doc.filename.includes(".") ? doc.filename.split(".").pop()!.toUpperCase() : "FILE";
            return (
              <tr key={doc.id}>
                <td>
                  <a href={api.documentDownloadUrl(doc.id)} target="_blank" rel="noreferrer">
                    {doc.filename}
                  </a>
                </td>
                <td><span className="pill pill-navy">{ext}</span></td>
                <td className="muted">{fmtBytes(doc.size_bytes)}</td>
                <td className="muted">{doc.uploaded_by_email || "--"}</td>
                <td className="muted">{fmtDate(doc.created_at)}</td>
                <td className="row-actions">
                  <a className="btn-link" href={api.documentDownloadUrl(doc.id)} target="_blank" rel="noreferrer">
                    {doc.previewable ? "Preview" : "Download"}
                  </a>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeDocument(doc)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {documents.length === 0 && (
            <tr><td colSpan={6} className="muted">No documents uploaded yet. Add one above to start building a reference library.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}


function StakeholdersTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { stakeholders } = await api.listStakeholders(projectId);
    setStakeholders(stakeholders);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addStakeholder(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      await api.createStakeholder(projectId, name.trim(), email || undefined, role || undefined);
      setName("");
      setEmail("");
      setRole("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't add that stakeholder.");
    }
  }

  function startEdit(s: Stakeholder) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditRole(s.role || "");
    setEditEmail(s.email || "");
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    await api.updateStakeholder(id, { name: editName.trim(), role: editRole || undefined, email: editEmail || undefined } as any);
    setEditingId(null);
    load();
  }

  async function removeStakeholder(id: string, label: string) {
    if (!(await confirmDialog(`Delete stakeholder "${label}"? You can restore it from Trash.`))) return;
    await api.deleteStakeholder(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <form className="inline-form inline-form-wide" onSubmit={addStakeholder}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} />
        <button className="btn btn-primary">Add stakeholder</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <ResizableTable id="stakeholders">
        <thead>
          <tr><th>Name</th><th>Role</th><th>Email</th><th>Decisions</th><th></th></tr>
        </thead>
        <tbody>
          {stakeholders.map((s) => (
            editingId === s.id ? (
              <tr key={s.id}>
                <td><input value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                <td><input value={editRole} onChange={(e) => setEditRole(e.target.value)} /></td>
                <td><input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /></td>
                <td>{s.decisions_resolved ?? 0} / {s.decisions_sent ?? 0} resolved</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(s.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.role || "--"}</td>
                <td>{s.email || "--"}</td>
                <td>{s.decisions_resolved ?? 0} / {s.decisions_sent ?? 0} resolved</td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(s)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeStakeholder(s.id, s.name)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {stakeholders.length === 0 && (
            <tr><td colSpan={5} className="muted">No stakeholders yet. Add one above to start your register.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

function DecisionsTab({ projectId }: { projectId: string }) {
  const [view, setView] = useState<"decisions" | "change_requests">("decisions");
  return (
    <div>
      <div className="inline-form" style={{ marginBottom: 16 }}>
        <button
          className={view === "decisions" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("decisions")}
        >
          Decisions
        </button>
        <button
          className={view === "change_requests" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("change_requests")}
        >
          Change requests
        </button>
      </div>
      {view === "decisions" && <StakeholderDecisionsTab projectId={projectId} />}
      {view === "change_requests" && <ChangeRequestsTab projectId={projectId} />}
    </div>
  );
}

function StakeholderDecisionsTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [options, setOptions] = useState("Approve, Reject");
  const [deadline, setDeadline] = useState("");
  const [selectedStakeholders, setSelectedStakeholders] = useState<string[]>([]);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [d, s] = await Promise.all([api.listDecisions(projectId), api.listStakeholders(projectId)]);
    setDecisions(d.decisions);
    setStakeholders(s.stakeholders);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function createDecision(e: React.FormEvent) {
    e.preventDefault();
    const opts = options.split(",").map((o) => o.trim()).filter(Boolean);
    if (!title.trim() || opts.length < 2) return;
    setError("");
    try {
      const { shareUrl } = await api.createDecision(
        projectId, title.trim(), context.trim(), opts, deadline || undefined, selectedStakeholders
      );
      setLastShareUrl(shareUrl);
      setTitle("");
      setContext("");
      setOptions("Approve, Reject");
      setDeadline("");
      setSelectedStakeholders([]);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't create that decision request.");
    }
  }

  async function removeDecision(id: string, label: string) {
    if (!(await confirmDialog(`Delete decision "${label}"? You can restore it from Trash.`))) return;
    await api.deleteDecision(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} type="button">
        {showForm ? "Cancel" : "New decision request"}
      </button>

      {lastShareUrl && (
        <div className="callout">
          Share this link with the stakeholder -- no account needed to respond:
          <br />
          <code>{window.location.origin}{lastShareUrl}</code>
        </div>
      )}

      {showForm && (
        <form className="stacked-form" onSubmit={createDecision}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          <label>Context</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} />
          <label>Options (comma separated)</label>
          <input value={options} onChange={(e) => setOptions(e.target.value)} required />
          <label>Deadline (optional)</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <label>Send to</label>
          <div className="checkbox-list">
            {stakeholders.map((s) => (
              <label key={s.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedStakeholders.includes(s.id)}
                  onChange={(e) => {
                    setSelectedStakeholders((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                    );
                  }}
                />
                {s.name}
              </label>
            ))}
            {stakeholders.length === 0 && <p className="muted">Add stakeholders first to route this to someone.</p>}
          </div>
          <button className="btn btn-primary" type="submit">Create decision request</button>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}

      <div className="decision-list">
        {decisions.map((d) => (
          <div key={d.id} className={`decision-card ${d.status}`}>
            <div className="decision-card-head">
              <h4>{d.title}</h4>
              <span className={`pill ${d.status === "open" ? "pill-gold" : "pill-green"}`}>
                {d.status === "open" ? "Awaiting response" : "Resolved"}
              </span>
            </div>
            {d.context && <p className="muted">{d.context}</p>}
            {d.status === "open" ? (
              <div className="share-row">
                <code>{window.location.origin}/d/{d.public_token}</code>
              </div>
            ) : (
              <div className="decision-record">
                <strong>{d.chosen_option}</strong> -- approved by <strong>{d.responder_name}</strong>
                <br />
                <span className="muted">{d.responded_at && fmtDateTime(d.responded_at)}</span>
              </div>
            )}
            <div className="row-actions" style={{ marginTop: 10 }}>
              <button className="btn-link btn-link-danger" type="button" onClick={() => removeDecision(d.id, d.title)}>Delete</button>
            </div>
          </div>
        ))}
        {decisions.length === 0 && <p className="muted">No decisions requested yet. Use New decision request above to ask for one.</p>}
      </div>
    </div>
  );
}

const CR_STATUS_LABEL: Record<ChangeRequest["status"], string> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  implemented: "Implemented",
};

function fmtSignedMoney(n: number | null): string {
  if (n === null || n === undefined) return "--";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
}

function fmtSignedDays(n: number | null): string {
  if (n === null || n === undefined) return "--";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(n)}d`;
}

function ChangeRequestsTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const { user } = useAuth();
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [ccbEnabled, setCcbEnabled] = useState(false);
  const [reviewers, setReviewers] = useState<ProjectMember[]>([]);
  const [isReviewer, setIsReviewer] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [scheduleImpactDays, setScheduleImpactDays] = useState("");
  const [budgetImpact, setBudgetImpact] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editDecidedBy, setEditDecidedBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");

  async function load() {
    setLoading(true);
    const [{ changeRequests }, { project }, { members }] = await Promise.all([
      api.listChangeRequests(projectId),
      api.getProject(projectId),
      api.listMembers(projectId),
    ]);
    setItems(changeRequests);
    setCcbEnabled(!!project.ccb_enabled);
    const boardMembers = members.filter((m) => m.is_ccb_reviewer);
    setReviewers(boardMembers);
    setIsReviewer(project.is_owner || boardMembers.some((m) => m.email === user?.email));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function signOff(id: string) {
    setSigningId(id);
    try {
      await api.signChangeRequest(id);
      await load();
    } finally {
      setSigningId(null);
    }
  }

  async function addChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createChangeRequest(
        projectId, title.trim(), description || undefined, reason || undefined,
        scheduleImpactDays ? Number(scheduleImpactDays) : undefined,
        budgetImpact ? Number(budgetImpact) : undefined,
        requestedBy || undefined
      );
      setTitle("");
      setDescription("");
      setReason("");
      setScheduleImpactDays("");
      setBudgetImpact("");
      setRequestedBy("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that change request.");
    }
  }

  async function setStatus(id: string, status: ChangeRequest["status"]) {
    setStatusError("");
    try {
      await api.updateChangeRequest(id, { status });
      load();
    } catch (err: any) {
      setStatusError(err.message || "Couldn't update status.");
    }
  }

  function startEdit(c: ChangeRequest) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditDescription(c.description || "");
    setEditReason(c.reason || "");
    setEditDecidedBy(c.decided_by || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateChangeRequest(id, {
      title: editTitle.trim(), description: editDescription || undefined, reason: editReason || undefined,
      decided_by: editDecidedBy || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeChangeRequest(id: string, label: string) {
    if (!(await confirmDialog(`Delete change request "${label}"? You can restore it from Trash.`))) return;
    await api.deleteChangeRequest(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Scope changes worth a paper trail -- what's changing, why, who asked for it, and what it
        does to schedule and budget.
      </p>
      <form className="stacked-form" onSubmit={addChangeRequest}>
        <label>Change request</label>
        <input placeholder="What's changing?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <label>Reason (optional)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <input
            type="number" placeholder="Schedule impact (days)"
            value={scheduleImpactDays} onChange={(e) => setScheduleImpactDays(e.target.value)}
          />
          <input
            type="number" placeholder="Budget impact ($)"
            value={budgetImpact} onChange={(e) => setBudgetImpact(e.target.value)}
          />
          <input placeholder="Requested by (optional)" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
          <button className="btn btn-primary">Log change request</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}
      {statusError && <p className="form-error">{statusError}</p>}

      <ResizableTable id="change-requests">
        <thead>
          <tr><th>Change request</th><th>Schedule</th><th>Budget</th><th>Requested by</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            editingId === c.id ? (
              <tr key={c.id}>
                <td>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" style={{ marginBottom: 4 }} />
                  <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} rows={2} placeholder="Reason" />
                </td>
                <td className="muted">{fmtSignedDays(c.schedule_impact_days)}</td>
                <td className="muted">{fmtSignedMoney(c.budget_impact)}</td>
                <td className="muted">
                  {c.requested_by || "--"}
                  <input
                    value={editDecidedBy} onChange={(e) => setEditDecidedBy(e.target.value)}
                    placeholder="Decided by" style={{ marginTop: 4 }}
                  />
                </td>
                <td className="muted">{CR_STATUS_LABEL[c.status]}</td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>
                  {c.title}
                  {c.reason && <div className="muted">{c.reason}</div>}
                  {c.decided_by && <div className="muted">Decided by {c.decided_by}</div>}
                  {ccbEnabled && (
                    <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>
                      CCB: {c.ccb_approvals.length}/{reviewers.length} signed
                      {reviewers.length > 0 && c.ccb_approvals.length < reviewers.length && isReviewer && !c.ccb_approvals.some((a) => a.email === user?.email) && (
                        <>
                          {" -- "}
                          <button
                            className="btn-link"
                            type="button"
                            disabled={signingId === c.id}
                            onClick={() => signOff(c.id)}
                          >
                            {signingId === c.id ? "Signing..." : "Sign off"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td>{fmtSignedDays(c.schedule_impact_days)}</td>
                <td>{fmtSignedMoney(c.budget_impact)}</td>
                <td>{c.requested_by || "--"}</td>
                <td>
                  <select
                    className={`status-select status-select-${c.status}`}
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value as ChangeRequest["status"])}
                  >
                    {Object.entries(CR_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeChangeRequest(c.id, c.title)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="muted">No change requests logged yet. Add one above if scope shifts.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

type WorkloadRow = {
  owner: string;
  open: number;
  blocked: number;
  overdue: number;
  capacity: CapacityLevel;
};

function computeWorkload(tasks: Task[]): WorkloadRow[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const byOwner = new Map<string, Omit<WorkloadRow, "capacity">>();
  let unassigned: Omit<WorkloadRow, "capacity"> | null = null;

  for (const t of tasks) {
    if (t.status === "done") continue; // capacity is about what's still on someone's plate
    const key = (t.owner_name || "").trim();
    let row: Omit<WorkloadRow, "capacity">;
    if (!key) {
      unassigned = unassigned || { owner: "Unassigned", open: 0, blocked: 0, overdue: 0 };
      row = unassigned;
    } else {
      row = byOwner.get(key) || { owner: key, open: 0, blocked: 0, overdue: 0 };
      byOwner.set(key, row);
    }
    row.open += 1;
    if (t.status === "blocked") row.blocked += 1;
    if (t.due_date && t.due_date.slice(0, 10) < todayStr) row.overdue += 1;
  }

  const withCapacity = (r: Omit<WorkloadRow, "capacity">): WorkloadRow => ({
    ...r,
    capacity: capacityLevel(r.open, r.blocked, r.overdue),
  });

  const rows = [...byOwner.values()].map(withCapacity).sort((a, b) => {
    const order: Record<CapacityLevel, number> = { overloaded: 0, busy: 1, ok: 2 };
    if (order[a.capacity] !== order[b.capacity]) return order[a.capacity] - order[b.capacity];
    return b.open - a.open;
  });
  return unassigned ? [...rows, withCapacity(unassigned)] : rows;
}

function TeamTab({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [owner, setOwner] = useState<{ id: string; email: string } | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ccbError, setCcbError] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [{ owner, members }, { tasks }, { project }] = await Promise.all([
      api.listMembers(projectId),
      api.listTasks(projectId),
      api.getProject(projectId),
    ]);
    setOwner(owner);
    setMembers(members);
    setWorkload(computeWorkload(tasks));
    setProject(project);
    setNameDraft(project.name);
    setLoading(false);
  }

  async function saveName() {
    if (!nameDraft.trim()) {
      setNameError("Project name can't be empty.");
      return;
    }
    setSavingName(true);
    setNameError("");
    setNameSaved(false);
    try {
      await api.updateProject(projectId, { name: nameDraft.trim() });
      setNameSaved(true);
      window.location.reload();
    } catch (err: any) {
      setNameError(err.message || "Failed to rename project.");
    } finally {
      setSavingName(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    if (!(await confirmDialog(`Delete "${project.name}"? Everything in it -- tasks, decisions, meetings, everything -- goes with it. You can restore the project from the Dashboard's Recently deleted section.`))) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteProject(projectId);
      navigate("/app");
    } catch (err: any) {
      setDeleting(false);
      setError(err.message || "Failed to delete project.");
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function toggleCcbEnabled() {
    if (!project) return;
    const next = !project.ccb_enabled;
    setProject({ ...project, ccb_enabled: next });
    setCcbError("");
    try {
      await api.updateProject(projectId, { ccb_enabled: next });
    } catch (err: any) {
      setProject({ ...project, ccb_enabled: !next });
      setCcbError(err.message || "Failed to update.");
    }
  }

  async function toggleReviewer(m: ProjectMember) {
    await api.setCcbReviewer(projectId, m.id, !m.is_ccb_reviewer);
    load();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    try {
      await api.inviteMember(projectId, email.trim());
      setEmail("");
      load();
    } catch (err: any) {
      setError(err.message || "Could not send invite.");
    }
  }

  async function remove(m: ProjectMember, isSelf: boolean) {
    if (!(await confirmDialog(isSelf ? "Leave this project?" : `Remove ${m.email} from this project?`))) return;
    await api.removeMember(projectId, m.id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div className="settings-max">
      {isOwner && (
        <div className="settings-card">
          <p className="settings-card-label">Project</p>
          <label>Project name</label>
          <div className="inline-form" style={{ marginBottom: 0 }}>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn-primary" type="button" onClick={saveName} disabled={savingName}>
              {savingName ? "Saving..." : "Save"}
            </button>
          </div>
          {nameSaved && <p style={{ color: "var(--success)", fontSize: 13, marginTop: 6 }}>Saved.</p>}
          {nameError && <p className="form-error">{nameError}</p>}
        </div>
      )}

      <div className="settings-card">
        <p className="settings-card-label">Members</p>
        <p className="muted" style={{ marginBottom: 16 }}>
          People with access can see and edit everything in this project. Only the owner can invite or remove members.
        </p>

        {owner && (
          <div className="member-row">
            <div className="member-avatar" style={{ background: avatarColor(owner.email) }}>{initials(owner.email)}</div>
            <div className="member-info">
              <div className="member-name">{owner.email}{owner.email === user?.email && " (you)"}</div>
              <div className="member-email">{owner.email}</div>
            </div>
            <span className="role-pill">Owner</span>
          </div>
        )}
        {members.map((m) => {
          const isSelf = m.email === user?.email;
          return (
            <div className="member-row" key={m.id}>
              <div className="member-avatar" style={{ background: avatarColor(m.email) }}>{initials(m.email)}</div>
              <div className="member-info">
                <div className="member-name">{m.email}{isSelf && " (you)"}</div>
                <div className="member-email">{m.status === "active" ? "Active" : "Invited -- awaiting sign-up"}</div>
              </div>
              <span className="role-pill">Member</span>
              {project?.ccb_enabled && (
                isOwner ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--slate)", marginLeft: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!m.is_ccb_reviewer} onChange={() => toggleReviewer(m)} />
                    CCB reviewer
                  </label>
                ) : m.is_ccb_reviewer ? (
                  <span className="role-pill" style={{ marginLeft: 10 }}>CCB reviewer</span>
                ) : null
              )}
              {(isOwner || isSelf) && (
                <button className="btn-link btn-link-danger" type="button" onClick={() => remove(m, isSelf)} style={{ marginLeft: 10 }}>
                  {isSelf ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>No one else has access yet. Invite a teammate below.</p>
        )}

        {isOwner && (
          <form className="inline-form" onSubmit={invite} style={{ marginTop: 16, marginBottom: 0 }}>
            <input
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-primary">Invite</button>
          </form>
        )}
        {error && <p className="muted" style={{ color: "var(--red)", marginTop: 8 }}>{error}</p>}
      </div>

      <div className="settings-card">
        <p className="settings-card-label">Change Control Board</p>
        <p className="muted" style={{ marginBottom: 12 }}>
          Not every project needs one. Turn this on if scope changes here go through a formal review
          board -- change requests will then need sign-off from every reviewer below before they can
          move to approved.
        </p>
        {isOwner ? (
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={!!project?.ccb_enabled} onChange={toggleCcbEnabled} />
            This project uses a Change Control Board
          </label>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {project?.ccb_enabled ? "Enabled by the project owner." : "Not enabled for this project."}
          </p>
        )}
        {project?.ccb_enabled && (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
            {isOwner
              ? "Check \"CCB reviewer\" next to any member above to add them to the board."
              : "Reviewers are marked \u201cCCB reviewer\u201d above."}
          </p>
        )}
        {ccbError && <p className="form-error">{ccbError}</p>}
      </div>

      <div className="settings-card">
        <p className="settings-card-label">Workload</p>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Grouped by the Owner field on each open task -- as clean as what's typed in, not tied to accounts.
          Capacity is a lightweight signal from open, blocked, and overdue counts, not hours -- overloaded
          means someone's plate looks heavier than what they can realistically move this week.
        </p>
        <ResizableTable id="team-workload">
          <thead>
            <tr><th>Owner</th><th>Open tasks</th><th>Blocked</th><th>Overdue</th><th>Capacity</th></tr>
          </thead>
          <tbody>
            {workload.map((w) => (
              <tr key={w.owner}>
                <td>{w.owner}</td>
                <td>{w.open}</td>
                <td>{w.blocked > 0 ? <span className="pill pill-red">{w.blocked}</span> : "--"}</td>
                <td>{w.overdue > 0 ? <span className="pill pill-red">{w.overdue}</span> : <span className="pill pill-green">0</span>}</td>
                <td><span className={`pill ${CAPACITY_PILL[w.capacity]}`}>{CAPACITY_LABEL[w.capacity]}</span></td>
              </tr>
            ))}
            {workload.length === 0 && (
              <tr><td colSpan={5} className="muted">No open tasks to show workload for.</td></tr>
            )}
          </tbody>
        </ResizableTable>
      </div>

      {isOwner && (
        <div className="settings-card danger-zone">
          <p className="settings-card-label">Danger zone</p>
          <p className="muted" style={{ marginBottom: 12 }}>
            Deleting a project removes it from your Dashboard and everyone's access, along with every
            task, decision, meeting, and everything else in it. It's a soft delete -- you can restore it
            from the Dashboard's Recently deleted section any time after.
          </p>
          <button className="btn btn-danger" type="button" onClick={deleteProject} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete project"}
          </button>
        </div>
      )}
    </div>
  );
}

const CLOSURE_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "finalLessons", label: "Final lessons learned captured" },
  { key: "openItemsResolved", label: "Outstanding risks and issues resolved or explicitly accepted" },
  { key: "budgetReconciled", label: "Budget reconciled against actuals" },
  { key: "stakeholderSignoff", label: "Stakeholder sign-off obtained" },
  { key: "documentsArchived", label: "Documents archived or handed off" },
];

function ClosureTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [project, setProject] = useState<Project | null>(null);
  const [openRisks, setOpenRisks] = useState(0);
  const [openIssues, setOpenIssues] = useState(0);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [{ project }, { risks }, { issues }] = await Promise.all([
      api.getProject(projectId),
      api.listRisks(projectId),
      api.listIssues(projectId),
    ]);
    setProject(project);
    setChecklist(project.closure_checklist || {});
    setNotes(project.closure_notes || "");
    setOpenRisks(risks.filter((r) => r.status !== "resolved").length);
    setOpenIssues(issues.filter((i) => i.status !== "resolved").length);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function toggleItem(key: string) {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    setSaving(true);
    setError("");
    try {
      await api.updateProject(projectId, { closureChecklist: next });
      setSavedAt(Date.now());
    } catch (err: any) {
      setChecklist(checklist); // revert on failure
      setError(err.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    setError("");
    try {
      await api.updateProject(projectId, { closureNotes: notes });
      setSavedAt(Date.now());
    } catch (err: any) {
      setError(err.message || "Couldn't save the notes.");
    } finally {
      setSaving(false);
    }
  }

  async function closeProject() {
    if (!(await confirmDialog("Mark this project closed? You can reopen it any time -- this doesn't archive or delete anything, it's just a record of when the work wrapped up."))) return;
    await api.setProjectClosed(projectId, true);
    load();
  }

  async function reopenProject() {
    await api.setProjectClosed(projectId, false);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  const checkedCount = CLOSURE_CHECKLIST_ITEMS.filter((item) => checklist[item.key]).length;

  return (
    <div className="settings-max">
      {project?.closed_at ? (
        <div className="settings-card" style={{ borderColor: "var(--success)" }}>
          <p className="settings-card-label">Closed</p>
          <p style={{ marginBottom: 12 }}>
            This project was marked closed on {fmtDate(project.closed_at)}. Every tab, tool, and
            record stays exactly as it was -- closing is just a status, not an archive or a lock.
          </p>
          <button className="btn btn-ghost" type="button" onClick={reopenProject}>Reopen project</button>
        </div>
      ) : (
        <>
          <div className="settings-card">
            <p className="settings-card-label">Before you close</p>
            <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
              A quick read on what's still open, not a blocker -- close whenever you're ready.
            </p>
            <div className="inline-form" style={{ marginBottom: 0 }}>
              <span className={openRisks > 0 ? "pill pill-gold" : "pill pill-green"}>{openRisks} open {openRisks === 1 ? "risk" : "risks"}</span>
              <span className={openIssues > 0 ? "pill pill-gold" : "pill pill-green"}>{openIssues} open {openIssues === 1 ? "issue" : "issues"}</span>
            </div>
          </div>

          <div className="settings-card">
            <p className="settings-card-label">Closure checklist ({checkedCount}/{CLOSURE_CHECKLIST_ITEMS.length})</p>
            {CLOSURE_CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={!!checklist[item.key]} onChange={() => toggleItem(item.key)} />
                {item.label}
              </label>
            ))}
          </div>

          <div className="settings-card">
            <p className="settings-card-label">Closure notes</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={4} placeholder="Anything worth recording about how this project wrapped up..." />
            {saving && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Saving...</p>}
            {!saving && savedAt && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Saved.</p>}
            {error && <p className="form-error">{error}</p>}
          </div>

          <div className="settings-card">
            <p className="settings-card-label">Close out</p>
            <p className="muted" style={{ marginBottom: 12 }}>
              Marking a project closed is just a record of when the work wrapped up -- it doesn't
              archive, lock, or delete anything, and you can reopen it any time.
            </p>
            <button className="btn btn-primary" type="button" onClick={closeProject}>Mark project closed</button>
          </div>
        </>
      )}
    </div>
  );
}

function ReportTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [view, setView] = useState<"weekly" | "lessons">("weekly");
  return (
    <div>
      <div className="inline-form no-print" style={{ marginBottom: 16 }}>
        <button
          className={view === "weekly" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("weekly")}
        >
          Weekly report
        </button>
        <button
          className={view === "lessons" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("lessons")}
        >
          Lessons learned
        </button>
      </div>
      {view === "weekly" && <WeeklyReportView projectId={projectId} projectName={projectName} />}
      {view === "lessons" && <LessonsLearnedTab projectId={projectId} />}
    </div>
  );
}

function WeeklyReportView({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [, setParams] = useSearchParams();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    api.getWeeklyReport(projectId).then(setReport);
    api.listMeetings(projectId).then(({ meetings }) => {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      setRecentMeetings(
        meetings.filter((m) => m.meeting_date && toLocalDate(m.meeting_date).getTime() >= sevenDaysAgo)
      );
    });
  }, [projectId]);

  if (!report) return <p className="muted">Loading report...</p>;

  const {
    snapshot, tasksCompleted, tasksAdded, issuesOpened, issuesResolved,
    risksOpened, risksResolved, decisionsMade, statusUpdates,
  } = report;

  return (
    <div className="export-view">
      <div className="export-header">
        <div>
          <h2>{projectName} -- Weekly Status Report</h2>
          <p className="muted">Last 7 days, generated {fmtDateTime(report.generatedAt)}</p>
        </div>
        <button className="btn btn-ghost no-print" onClick={() => window.print()} type="button">Print / Save as PDF</button>
      </div>

      <div className="stat-row" style={{ marginBottom: 24, flexWrap: "wrap" }}>
        <div className="stat"><strong>{snapshot.open_tasks}</strong> open tasks</div>
        <div className="stat"><strong>{snapshot.blocked_tasks}</strong> blocked</div>
        <div className="stat"><strong>{snapshot.open_issues}</strong> open issues</div>
        <div className="stat"><strong>{snapshot.urgent_issues}</strong> urgent issues</div>
        <div className="stat"><strong>{snapshot.open_risks}</strong> open risks</div>
        <div className="stat"><strong>{snapshot.open_decisions}</strong> decisions awaiting response</div>
      </div>

      {recentMeetings !== null && (
        <div className="today-section no-print">
          <h4>Meetings this week ({recentMeetings.length})</h4>
          <ul className="today-list">
            {recentMeetings.map((m) => (
              <li key={m.id}>
                {m.title} <span className="muted">-- {MEETING_TYPE_LABEL[m.meeting_type]}{m.meeting_date ? ` -- ${fmtLocalDate(m.meeting_date)}` : ""}</span>
              </li>
            ))}
            {recentMeetings.length === 0 && <li className="muted">No meetings logged this week.</li>}
          </ul>
          <button className="btn-link" type="button" onClick={() => setParams({ tab: "meetings" })}>
            Go to Meetings -&gt;
          </button>
        </div>
      )}

      <div className="today-section">
        <h4>Completed this week ({tasksCompleted.length})</h4>
        <ul className="today-list">
          {tasksCompleted.map((t) => <li key={t.id}>{t.title} <span className="muted">-- {t.owner_name || "unassigned"}</span></li>)}
          {tasksCompleted.length === 0 && <li className="muted">Nothing marked done this week.</li>}
        </ul>
      </div>

      <div className="today-section">
        <h4>New tasks added ({tasksAdded.length})</h4>
        <ul className="today-list">
          {tasksAdded.map((t) => <li key={t.id}>{t.title} <span className="muted">-- {STATUS_LABEL[t.status as Task["status"]]}{t.due_date ? ` -- due ${fmtLocalDate(t.due_date)}` : ""}</span></li>)}
          {tasksAdded.length === 0 && <li className="muted">No new tasks this week.</li>}
        </ul>
      </div>

      <div className="today-section">
        <h4>Issues opened ({issuesOpened.length}) / resolved ({issuesResolved.length})</h4>
        <ul className="today-list">
          {issuesOpened.map((t) => <li key={t.id}>Opened: {t.title} <span className="muted">-- {SEVERITY_LABEL[t.severity as Issue["severity"]]}</span></li>)}
          {issuesResolved.map((t) => <li key={t.id}>Resolved: {t.title}{t.resolution ? ` -- ${t.resolution}` : ""}</li>)}
          {issuesOpened.length === 0 && issuesResolved.length === 0 && <li className="muted">No issue activity this week.</li>}
        </ul>
      </div>

      <div className="today-section">
        <h4>Risks opened ({risksOpened.length}) / resolved ({risksResolved.length})</h4>
        <ul className="today-list">
          {risksOpened.map((t) => <li key={t.id}>Opened: {t.title} <span className="muted">-- {LEVEL_LABEL[t.probability as Risk["probability"]]} probability / {LEVEL_LABEL[t.impact as Risk["impact"]]} impact</span></li>)}
          {risksResolved.map((t) => <li key={t.id}>Resolved: {t.title}</li>)}
          {risksOpened.length === 0 && risksResolved.length === 0 && <li className="muted">No risk activity this week.</li>}
        </ul>
      </div>

      <div className="today-section">
        <h4>Decisions made ({decisionsMade.length})</h4>
        <ul className="today-list">
          {decisionsMade.map((d) => <li key={d.id}>{d.title}: <strong>{d.chosen_option}</strong> -- approved by {d.responder_name}</li>)}
          {decisionsMade.length === 0 && <li className="muted">No decisions resolved this week.</li>}
        </ul>
      </div>

      <div className="today-section">
        <h4>Notes posted ({statusUpdates.length})</h4>
        <ul className="today-list">
          {statusUpdates.map((s) => <li key={s.id}>{s.body}</li>)}
          {statusUpdates.length === 0 && <li className="muted">No notes posted this week.</li>}
        </ul>
      </div>
    </div>
  );
}

const LESSON_CATEGORY_LABEL: Record<Lesson["category"], string> = {
  went_well: "Went well",
  went_poorly: "Went poorly",
  action_item: "Action item",
};

const LESSON_CATEGORY_PILL: Record<Lesson["category"], string> = {
  went_well: "pill-green",
  went_poorly: "pill-red",
  action_item: "pill-gold",
};

function LessonsLearnedTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [category, setCategory] = useState<Lesson["category"]>("went_well");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [owner, setOwner] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { lessons } = await api.listLessons(projectId);
    setLessons(lessons);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    setError("");
    try {
      await api.createLesson(projectId, summary.trim(), category, details || undefined, owner || undefined);
      setSummary("");
      setDetails("");
      setOwner("");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that lesson.");
    }
  }

  async function toggleDone(l: Lesson) {
    await api.updateLesson(l.id, { status: l.status === "done" ? "open" : "done" });
    load();
  }

  function startEdit(l: Lesson) {
    setEditingId(l.id);
    setEditSummary(l.summary);
    setEditDetails(l.details || "");
    setEditOwner(l.owner_name || "");
  }

  async function saveEdit(id: string) {
    if (!editSummary.trim()) return;
    await api.updateLesson(id, {
      summary: editSummary.trim(), details: editDetails || undefined, owner_name: editOwner || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeLesson(id: string, label: string) {
    if (!(await confirmDialog(`Delete lesson "${label}"? You can restore it from Trash.`))) return;
    await api.deleteLesson(id);
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        What went well, what didn't, and what to change next time -- mirrors the retro template in
        the Resource hub. Log entries any time, not just at project close.
      </p>
      <form className="stacked-form" onSubmit={addLesson}>
        <label>Lesson</label>
        <input placeholder="What happened?" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <label>Details (optional)</label>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} />
        <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value as Lesson["category"])}>
            {Object.entries(LESSON_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <button className="btn btn-primary">Log lesson</button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}

      <ResizableTable id="lessons-learned">
        <thead>
          <tr><th>Lesson</th><th>Category</th><th>Owner</th><th></th><th></th></tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            editingId === l.id ? (
              <tr key={l.id}>
                <td>
                  <input value={editSummary} onChange={(e) => setEditSummary(e.target.value)} style={{ marginBottom: 4 }} />
                  <textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)} rows={2} placeholder="Details" />
                </td>
                <td className="muted">{LESSON_CATEGORY_LABEL[l.category]}</td>
                <td><input value={editOwner} onChange={(e) => setEditOwner(e.target.value)} /></td>
                <td></td>
                <td className="row-actions">
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(l.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={l.id}>
                <td style={{ textDecoration: l.status === "done" ? "line-through" : "none" }}>
                  {l.summary}
                  {l.details && <div className="muted" style={{ textDecoration: "none" }}>{l.details}</div>}
                </td>
                <td><span className={`pill ${LESSON_CATEGORY_PILL[l.category]}`}>{LESSON_CATEGORY_LABEL[l.category]}</span></td>
                <td>{l.owner_name || "--"}</td>
                <td>
                  {l.category === "action_item" && (
                    <button className="btn-link" type="button" onClick={() => toggleDone(l)}>
                      {l.status === "done" ? "Mark open" : "Mark done"}
                    </button>
                  )}
                </td>
                <td className="row-actions">
                  <button className="btn-link" type="button" onClick={() => startEdit(l)}>Edit</button>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => removeLesson(l.id, l.summary)}>Delete</button>
                </td>
              </tr>
            )
          ))}
          {lessons.length === 0 && (
            <tr><td colSpan={5} className="muted">No lessons logged yet. Log one any time, not just at project close.</td></tr>
          )}
        </tbody>
      </ResizableTable>
    </div>
  );
}

const TEMPLATES: { type: "charter" | "risk-register" | "raci"; title: string; blurb: string }[] = [
  {
    type: "charter",
    title: "Project Charter",
    blurb: "Purpose, budget, stakeholders, key milestones, and top risks pulled straight from this project -- with a sign-off section at the bottom.",
  },
  {
    type: "risk-register",
    title: "Risk Register",
    blurb: "Every logged risk with probability, impact, exposure, mitigation, owner, and status -- ready to hand to a sponsor or auditor.",
  },
  {
    type: "raci",
    title: "RACI Matrix",
    blurb: "Tasks as rows, stakeholders as columns, pre-filled with “R” wherever a task owner matches a stakeholder -- fill in A/C/I by hand.",
  },
];

function TemplatesTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleDownload(type: "charter" | "risk-register" | "raci", title: string) {
    setError("");
    setDownloading(type);
    try {
      await api.downloadTemplate(projectId, type, `${projectName || "tasketra"}-${type}.docx`);
    } catch (err: any) {
      setError(err.message || `Couldn't generate the ${title}.`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 20 }}>
        Ready-to-use PM documents generated from this project's live data -- no need to leave Tasketra to find a template.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <div key={t.type} className="template-card">
            <h4>{t.title}</h4>
            <p className="muted">{t.blurb}</p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={downloading === t.type}
              onClick={() => handleDownload(t.type, t.title)}
            >
              {downloading === t.type ? "Generating..." : "Download .docx"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionsTab({ projectId }: { projectId: string }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const [savedMsg, setSavedMsg] = useState(false);

  async function load() {
    setLoading(true);
    const [{ webhook_url }, { project }] = await Promise.all([
      api.getWebhookSettings(),
      api.getProject(projectId),
    ]);
    setSavedUrl(webhook_url);
    setWebhookUrl(webhook_url || "");
    setEnabled(project.webhook_enabled ?? false);
    setIsOwner(project.is_owner ?? false);
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]);

  async function saveUrl() {
    setSaving(true);
    setUrlError("");
    setSavedMsg(false);
    try {
      const { webhook_url } = await api.setWebhookSettings(webhookUrl.trim());
      setSavedUrl(webhook_url);
      setSavedMsg(true);
    } catch (err: any) {
      setUrlError(err.message || "Failed to save webhook URL.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setToggleError("");
    try {
      await api.setProjectWebhookEnabled(projectId, next);
    } catch (err: any) {
      setEnabled(!next);
      setToggleError(err.message || "Failed to update.");
    }
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ maxWidth: 640, marginBottom: 20 }}>
        Send this project's activity (tasks, issues, decisions, and more) to any URL you provide — a Zapier or Make webhook step, a Slack "Incoming Webhook," or your own endpoint. One webhook URL is shared across every project you own; each project decides whether to send to it below.
      </p>

      <div className="template-card" style={{ maxWidth: 640, marginBottom: 20 }}>
        <h4>Webhook URL</h4>
        <p className="muted">Applies to your whole account — saving here updates it everywhere.</p>
        {isOwner ? (
          <>
            <div className="inline-form" style={{ marginBottom: 0 }}>
              <input
                type="url"
                placeholder="https://hooks.example.com/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                style={{ flex: 1, minWidth: 280 }}
              />
              <button className="btn btn-primary" type="button" onClick={saveUrl} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            {savedMsg && <p style={{ color: "var(--success)", fontSize: 13, marginTop: 4 }}>Saved.</p>}
            {urlError && <p className="form-error">{urlError}</p>}
          </>
        ) : (
          <p className="muted">{savedUrl ? "Configured by the project owner." : "Not configured yet — the project owner can set this up."}</p>
        )}
      </div>

      <div className="template-card" style={{ maxWidth: 640 }}>
        <h4>This project</h4>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: isOwner && savedUrl ? "pointer" : "default" }}>
          <input type="checkbox" checked={enabled} onChange={toggle} disabled={!isOwner || !savedUrl} />
          Send this project's events to the webhook above
        </label>
        {isOwner && !savedUrl && <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>Set a webhook URL above first.</p>}
        {!isOwner && <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>Only the project owner can change this.</p>}
        {toggleError && <p className="form-error">{toggleError}</p>}
      </div>
    </div>
  );
}

function ExportTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listDecisions(projectId).then(({ decisions }) => {
      setDecisions(decisions.filter((d) => d.status === "resolved"));
      setLoading(false);
    });
  }, [projectId]);

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div className="export-view">
      <div className="export-header">
        <h2>{projectName} -- Decision Audit Trail</h2>
        <button className="btn btn-ghost no-print" onClick={() => window.print()} type="button">Print / Save as PDF</button>
      </div>
      {decisions.map((d) => (
        <div key={d.id} className="decision-record-card">
          <h4>{d.title}</h4>
          {d.context && <p>{d.context}</p>}
          <p><strong>{d.chosen_option}</strong> -- approved by <strong>{d.responder_name}</strong></p>
          <p className="muted">{d.responded_at && fmtDateTime(d.responded_at)}</p>
        </div>
      ))}
      {decisions.length === 0 && <p className="muted">No resolved decisions yet.</p>}
    </div>
  );
}
