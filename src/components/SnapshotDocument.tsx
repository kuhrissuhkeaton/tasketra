import type { SnapshotData } from "../lib/api";
import { Gauge } from "./charts/Gauge";
import { Donut } from "./charts/Donut";
import { categoricalColor } from "./charts/palette";
import { HEALTH_LABEL, type HealthValue } from "../lib/healthLabels";
import { fmtLocalDate, fmtLongDate, fmtMoney } from "../lib/format";

// The Client Snapshot (v168): a read-only sponsor view of one project,
// rendered by the public share page and by the signed-in preview page.
// Stripped on purpose — the stated status and the last check-in note,
// the three gauges, work by phase, milestones, the top risks in plain
// words, and the decisions the sponsor owns. No edit controls, no
// acronyms, no internal registers, nothing about any other project.

const HEALTH_PILL: Record<HealthValue, string> = {
  on_track: "pill-green",
  at_risk: "pill-gold",
  off_track: "pill-red",
};

export function SnapshotDocument({ projectName, snapshot, dateLabel }: {
  projectName: string;
  snapshot: SnapshotData;
  dateLabel: string;
}) {
  const { status, completion, time, budget, phases, phasesByStatus, milestones, risks, decisions } = snapshot;
  const phaseTotal = phases.reduce((sum, g) => sum + g.total, 0);

  return (
    <article className="snapshot-doc">
      <header className="risk-doc-head">
        <p className="muted risk-doc-kicker">Project snapshot</p>
        <h1>{projectName}</h1>
        <p className="muted">{dateLabel}</p>
      </header>

      {status && (status.health || status.note) && (
        <section className="snapshot-status">
          <div className="snapshot-status-head">
            <h2>Status</h2>
            {status.health && (
              <span className={`pill ${HEALTH_PILL[status.health]}`}>{HEALTH_LABEL[status.health]}</span>
            )}
          </div>
          {status.note && <p className="snapshot-note">{status.note}</p>}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            From the latest check-in, {fmtLongDate(status.at)}
          </p>
        </section>
      )}

      <div className="dash-gauges">
        {completion ? (
          <div className="dash-viz-card">
            <Gauge
              label="Completion"
              percent={completion.percent}
              tone="brand"
              value={`${completion.percent}%`}
              words={`${completion.done} of ${completion.total} tasks done`}
            />
          </div>
        ) : (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>No tasks yet, so there is nothing to measure.</p>
          </div>
        )}
        {time ? (
          <div className="dash-viz-card">
            <Gauge
              label="Time used"
              percent={time.percent}
              tone="brand"
              value={`${time.percent}%`}
              words={`Planned ${fmtLocalDate(time.start)} to ${fmtLocalDate(time.end)}`}
            />
          </div>
        ) : (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>No planned dates yet, so there is no span to measure time against.</p>
          </div>
        )}
        {budget ? (
          <div className="dash-viz-card">
            <Gauge
              label="Budget used"
              percent={budget.percent}
              tone={budget.spent > budget.total ? "crit" : "brand"}
              value={`${budget.percent}%`}
              words={`${fmtMoney(budget.spent)} of ${fmtMoney(budget.total)} spent`}
            />
          </div>
        ) : (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>No budget set yet.</p>
          </div>
        )}
      </div>

      {phases.length > 0 && phaseTotal > 0 && (
        <section>
          <h2>{phasesByStatus ? "Work by status" : "Work by phase"}</h2>
          <div className="dash-viz-card">
            <Donut
              segments={phases.map((g) => ({ label: g.label, value: g.total }))}
              colors={phases.map((_, i) => categoricalColor(i))}
              centerValue={String(phaseTotal)}
              centerLabel={phaseTotal === 1 ? "task" : "tasks"}
              ariaLabel={`Work breakdown: ${phases.map((g) => `${g.label}, ${g.total} of ${phaseTotal} tasks`).join("; ")}`}
            />
            <table className="cockpit-table">
              <thead>
                <tr><th>{phasesByStatus ? "Status" : "Phase"}</th><th>Done</th><th>Share</th></tr>
              </thead>
              <tbody>
                {phases.map((g) => (
                  <tr key={g.label}>
                    <td>{g.label}</td>
                    <td>{phasesByStatus ? `${g.total} of ${phaseTotal}` : `${g.done} of ${g.total}`}</td>
                    <td>{g.total} of {phaseTotal} · {Math.round((g.total / phaseTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {milestones.length > 0 && (
        <section>
          <h2>Milestones</h2>
          <ol className="snapshot-milestones">
            {milestones.map((m) => (
              <li key={`${m.title}-${m.date}`} className={m.done ? "is-done" : undefined}>
                <span className="snapshot-milestone-dot" aria-hidden="true" />
                <span className="snapshot-milestone-title">{m.title}</span>
                <span className="muted">{m.done ? "Done · " : ""}{fmtLocalDate(m.date)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {risks.length > 0 && (
        <section>
          <h2>What we are watching</h2>
          <ul className="snapshot-risks">
            {risks.map((r) => (
              <li key={r.title}>
                <strong>{r.title}</strong>
                {r.mitigation && <p style={{ margin: "4px 0 0" }}>What we are doing about it: {r.mitigation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {decisions.length > 0 && (
        <section>
          <h2>Decisions waiting on you</h2>
          <ul className="snapshot-decisions">
            {decisions.map((d) => (
              <li key={`${d.title}-${d.deadline ?? ""}`}>
                <strong>{d.title}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {d.owner}{d.deadline ? ` · needed by ${fmtLocalDate(d.deadline)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
