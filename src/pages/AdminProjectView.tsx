import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AdminProjectSnapshot, type AdminUserProject } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { PageHeader, SoftCard } from "../components/ui";
import { fmtDate, fmtBytes } from "../lib/format";
import { useDocumentTitle } from "../lib/documentTitle";

// Admin support view (v149): read-only look at another user's projects, so
// Kk can help from the same facts the user sees. Nothing on these pages can
// change anything — the API behind them is GET-only.

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function label(s: string | null | undefined): string {
  return s ? s.replace(/_/g, " ") : "—";
}

export function AdminUserProjects() {
  useDocumentTitle("Support view");
  const { userId } = useParams<{ userId: string }>();
  const [owner, setOwner] = useState<{ id: string; email: string; display_name: string | null } | null>(null);
  const [projects, setProjects] = useState<AdminUserProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await api.adminListUserProjects(userId!);
        if (!live) return;
        setOwner(data.owner);
        setProjects(data.projects);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Could not load this account's projects.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [userId]);

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader
          title="Support view"
          subtitle={owner ? `Projects owned by ${owner.display_name ? `${owner.display_name} (${owner.email})` : owner.email} — read-only.` : undefined}
        />
        <p><Link className="btn btn-ghost" to="/admin/founding-members">Back to accounts</Link></p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? (
          <p className="muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <p className="muted">This account owns no projects.</p>
        ) : (
          <ul className="rg-list" aria-label="Projects">
            {projects.map((p) => (
              <li key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border, #ddd)" }}>
                <Link to={`/admin/support/project/${p.id}`}>{p.name}</Link>
                <span className="muted">
                  {" · "}{label(p.stage)}{p.archived ? " · archived" : ""}
                  {" · "}{plural(p.task_count, "task")}
                  {" · "}{plural(p.open_decisions, "open decision")}
                  {" · "}{plural(p.document_count, "document")}
                  {" · created "}{fmtDate(p.created_at)}
                  {p.last_activity_at ? ` · last activity ${fmtDate(p.last_activity_at)}` : " · no activity yet"}
                </span>
                {p.description && <div className="muted">{p.description}</div>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export function AdminProjectView() {
  useDocumentTitle("Support view — project");
  const { projectId } = useParams<{ projectId: string }>();
  const [snap, setSnap] = useState<AdminProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await api.adminGetProjectSnapshot(projectId!);
        if (live) setSnap(data);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Could not load this project.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [projectId]);

  const p = snap?.project;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader title={p ? p.name : "Support view"} subtitle="Admin support view" />
        {p && (
          <p className="pill pill-gold" role="status">
            Support view — you are looking at {p.owner_display_name ? `${p.owner_display_name} (${p.owner_email})` : p.owner_email}&rsquo;s project, read-only. This view is logged.
          </p>
        )}
        <p><Link className="btn btn-ghost" to={p ? `/admin/support/${p.owner_id}` : "/admin/founding-members"}>Back to their projects</Link></p>

        {error && <p className="form-error" role="alert">{error}</p>}
        {loading && <p className="muted">Loading project…</p>}

        {snap && p && (
          <>
            <SoftCard title="At a glance">
              <p>
                {plural(snap.tasks.length, "task")} · {plural(snap.decisions.filter((d) => d.status === "open").length, "open decision")} ·{" "}
                {plural(snap.risks.length, "risk")} · {plural(snap.issues.length, "issue")} · {plural(snap.documents.length, "document")} ·{" "}
                {plural(snap.stakeholders.length, "stakeholder")} · {plural(snap.members.length, "invited member")}
              </p>
              <p className="muted">
                Stage: {label(p.stage)} · Created {fmtDate(p.created_at)} ·{" "}
                {p.last_activity_at ? `Last activity ${fmtDate(p.last_activity_at)}` : "No activity recorded"}
                {p.archived ? " · Archived" : ""}{p.closed_at ? ` · Closed ${fmtDate(p.closed_at)}` : ""}
              </p>
              {p.description && <p>{p.description}</p>}
              {snap.tasks.length === 0 && snap.documents.length === 0 && snap.decisions.length === 0 && (
                <p className="muted">This project is empty: no tasks, decisions, or documents have been saved to it.</p>
              )}
            </SoftCard>

            <SoftCard title="Check-ins">
              {snap.statusUpdates.length === 0 ? <p className="muted">No check-ins yet.</p> : (
                <ul>
                  {snap.statusUpdates.map((u) => (
                    <li key={u.id}>
                      <span className="muted">{fmtDate(u.created_at)}</span>
                      {u.health ? <> · <span className="pill">{label(u.health)}</span></> : null}
                      {u.body ? <> — {u.body}</> : null}
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Tasks">
              {snap.tasks.length === 0 ? <p className="muted">No tasks yet.</p> : (
                <ul>
                  {snap.tasks.map((t) => (
                    <li key={t.id}>
                      {t.title} <span className="muted">· {label(t.status)}{t.owner_name ? ` · ${t.owner_name}` : ""}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ""}{t.priority ? ` · ${label(t.priority)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {snap.taskLinks.length > 0 && (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>Dependencies:</p>
                  <ul>
                    {snap.taskLinks.map((l) => (
                      <li key={`${l.task_id}-${l.depends_on_task_id}`}>{l.task_title} <span className="muted">depends on</span> {l.depends_on_title}</li>
                    ))}
                  </ul>
                </>
              )}
            </SoftCard>

            <SoftCard title="Roadmap">
              {snap.roadmapItems.length === 0 ? <p className="muted">No roadmap items yet.</p> : (
                <ul>
                  {snap.roadmapItems.map((r) => (
                    <li key={r.id}>
                      {r.title} <span className="muted">· {label(r.type)} · {label(r.status)}{r.start_date ? ` · ${fmtDate(r.start_date)}` : ""}{r.end_date ? ` – ${fmtDate(r.end_date)}` : ""}{r.task_total ? ` · ${r.task_done}/${r.task_total} tasks done` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Decisions">
              {snap.decisions.length === 0 ? <p className="muted">No decisions yet.</p> : (
                <ul>
                  {snap.decisions.map((d) => (
                    <li key={d.id}>
                      {d.title} <span className="muted">· {label(d.status)}{d.deadline ? ` · deadline ${fmtDate(d.deadline)}` : ""}</span>
                      {d.chosen_option && <div className="muted">Decided: {d.chosen_option}{d.responder_name ? ` (${d.responder_name})` : ""}</div>}
                      {d.recipients.length > 0 && <div className="muted">Asked: {d.recipients.map((r) => r.name).join(", ")}</div>}
                      {d.context && <div className="muted">{d.context}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Risks">
              {snap.risks.length === 0 ? <p className="muted">No risks yet.</p> : (
                <ul>
                  {snap.risks.map((r) => (
                    <li key={r.id}>{r.title} <span className="muted">· {label(r.status)}{r.owner_name ? ` · ${r.owner_name}` : ""}{r.probability ? ` · probability ${label(r.probability)}` : ""}{r.impact ? ` · impact ${label(r.impact)}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Issues">
              {snap.issues.length === 0 ? <p className="muted">No issues yet.</p> : (
                <ul>
                  {snap.issues.map((i) => (
                    <li key={i.id}>{i.title} <span className="muted">· {label(i.status)}{i.severity ? ` · ${label(i.severity)}` : ""}{i.owner_name ? ` · ${i.owner_name}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Assumptions">
              {snap.assumptions.length === 0 ? <p className="muted">No assumptions yet.</p> : (
                <ul>
                  {snap.assumptions.map((a) => (
                    <li key={a.id}>{a.statement} <span className="muted">· {label(a.status)}{a.owner_name ? ` · ${a.owner_name}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="People">
              <p className="muted">Owner: {p.owner_display_name ? `${p.owner_display_name} (${p.owner_email})` : p.owner_email}</p>
              {snap.members.length > 0 && (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>Members:</p>
                  <ul>
                    {snap.members.map((m) => (
                      <li key={m.id}>{m.email} <span className="muted">· {label(m.status)}</span></li>
                    ))}
                  </ul>
                </>
              )}
              {snap.stakeholders.length > 0 && (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>Stakeholders:</p>
                  <ul>
                    {snap.stakeholders.map((s) => (
                      <li key={s.id}>{s.name} <span className="muted">{s.role ? `· ${s.role}` : ""}{s.email ? ` · ${s.email}` : ""}</span></li>
                    ))}
                  </ul>
                </>
              )}
            </SoftCard>

            <SoftCard title="Documents">
              {snap.documents.length === 0 ? <p className="muted">No documents yet.</p> : (
                <ul>
                  {snap.documents.map((d) => (
                    <li key={d.id}>
                      <a href={api.adminDocumentDownloadUrl(p.id, d.id)} target="_blank" rel="noreferrer">{d.filename}</a>
                      <span className="muted"> · {fmtBytes(d.size_bytes)} · uploaded {fmtDate(d.created_at)}{d.uploaded_by_email ? ` by ${d.uploaded_by_email}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>

            <SoftCard title="Recent activity">
              {snap.activity.length === 0 ? <p className="muted">No activity recorded.</p> : (
                <ul>
                  {snap.activity.map((a) => (
                    <li key={a.id}>
                      <span className="muted">{fmtDate(a.created_at)}</span> — {a.summary || `${a.action} ${a.entity_title ?? a.entity_type}`}
                    </li>
                  ))}
                </ul>
              )}
            </SoftCard>
          </>
        )}
      </main>
    </div>
  );
}
