import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type SnapshotData } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { ShareBox } from "../components/ShareBox";
import { SnapshotDocument } from "../components/SnapshotDocument";
import { useDocumentTitle } from "../lib/documentTitle";
import { fmtLongDate } from "../lib/format";
import { workGroups, plannedWindow } from "../lib/workGroups";
import { daysBetween } from "../lib/calendarItems";

// Signed-in Client Snapshot page (v168): a live preview of exactly what
// the sponsor sees through the share link, plus the owner's link
// controls. The preview assembles the same payload shape the public
// endpoint builds server-side (netlify/lib/snapshotData.ts), from the
// regular APIs and the shared cockpit math, so the two cannot drift.

function todayKey(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// The public endpoint's risk ordering, mirrored exactly: highest
// probability/impact combinations first, newest first within a band.
function riskRank(r: { probability: string; impact: string }): number {
  if (r.probability === "high" && r.impact === "high") return 0;
  if (r.probability === "high" || r.impact === "high") return 1;
  if (r.probability === "medium" && r.impact === "medium") return 2;
  return 3;
}

export default function SnapshotPrint() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(project ? `Client snapshot | ${project.name}` : "Client snapshot");
  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProject(id),
      api.getBudget(id),
      api.listTasks(id),
      api.listRoadmapItems(id),
      api.listRisks(id),
      api.listDecisions(id),
      api.getFeed(id),
    ])
      .then(([p, budget, tasksRes, itemsRes, risksRes, decisionsRes, feedRes]) => {
        setProject(p.project);

        const total = budget.taskStats.totalTasks;
        const done = budget.taskStats.doneTasks;
        const { groups, byStatus } = tasksRes.tasks.length > 0
          ? workGroups(tasksRes.tasks)
          : { groups: [], byStatus: false };

        const window = plannedWindow(itemsRes.items);
        let time: SnapshotData["time"] = null;
        if (window) {
          const span = daysBetween(window.start, window.end);
          const elapsed = Math.max(0, Math.min(span, daysBetween(window.start, todayKey())));
          time = { percent: span > 0 ? Math.round((elapsed / span) * 100) : 0, start: window.start, end: window.end };
        }

        const bac = budget.budgetAtCompletion;
        const ac = budget.metrics.ac;

        const milestones = itemsRes.items
          .filter((i) => i.type === "milestone")
          .map((i) => ({
            title: i.title,
            date: (i.end_date ?? i.start_date ?? "").slice(0, 10),
            done: i.status === "done",
          }))
          .filter((m) => m.date)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        const risks = risksRes.risks
          .filter((r) => r.status === "open" || r.status === "monitoring")
          .sort((a, b) =>
            riskRank(a) - riskRank(b)
            || (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 3)
          .map((r) => ({ title: r.title, mitigation: r.mitigation ?? null }));

        const decisions = decisionsRes.decisions
          .filter((d) => d.status === "open" && d.owner_stakeholder_id && d.owner)
          .sort((a, b) => {
            if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
            if (a.deadline) return -1;
            if (b.deadline) return 1;
            return a.created_at < b.created_at ? -1 : 1;
          })
          .map((d) => ({ title: d.title, deadline: d.deadline ? d.deadline.slice(0, 10) : null, owner: d.owner!.name }));

        const latest = feedRes.feed.find((f) => f.type === "status_update");

        setSnapshot({
          status: latest ? { health: latest.health, note: latest.body, at: latest.ts } : null,
          completion: total > 0 ? { done, total, percent: Math.round((done / total) * 100) } : null,
          time,
          budget: bac !== null ? { spent: ac, total: bac, percent: bac > 0 ? Math.round((ac / bac) * 100) : 0 } : null,
          phases: groups,
          phasesByStatus: byStatus,
          milestones,
          risks,
          decisions,
        });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <main className="public-roadmap"><Wordmark size="sm" /><p className="form-error">{error}</p></main>;
  if (!project || !snapshot) return <main className="public-roadmap"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /></div></main>;

  return (
    <main className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Link to={`/app/projects/${id}`} className="muted">← Back to {project.name}</Link>
        <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      {project.is_owner === true && (
        <ShareBox
          projectId={project.id}
          kind="snapshot"
          recipientsSee="They see the status you stated at your last check-in, how much of the work, time and budget is used, the milestones, the top three things being watched, and any open decisions a stakeholder owns. Task lists, registers and other projects are never included."
        />
      )}

      <SnapshotDocument
        projectName={project.name}
        snapshot={snapshot}
        dateLabel={`As of ${fmtLongDate(new Date().toISOString())}`}
      />
    </main>
  );
}
