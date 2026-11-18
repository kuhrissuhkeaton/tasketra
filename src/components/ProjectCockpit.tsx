import { useEffect, useState } from "react";
import { api, type BudgetData, type RoadmapItem, type Task } from "../lib/api";
import { Gauge } from "./charts/Gauge";
import { Donut } from "./charts/Donut";
import { VarianceBars } from "./charts/VarianceBars";
import { categoricalColor } from "./charts/palette";
import { fmtLocalDate, fmtMoney } from "../lib/format";
import { daysBetween, monthKeyOf } from "../lib/calendarItems";
import { workGroups, plannedWindow, type WorkGroup } from "../lib/workGroups";

// Re-exported for the cockpit tests; the implementations live in
// lib/workGroups (v168) so the Client Snapshot reads the same math.
export { workGroups, plannedWindow };

// Project Cockpit (v165, dashboard plan Phase 8). The single-project
// Overview leads with the shared visual kit (built in v164): completion,
// time and budget gauges, a work-breakdown donut with its table, the
// budget variance bar with the forecast at finish, and -- behind an
// Advanced toggle that defaults off -- the schedule/budget health
// indexes in plain words with SPI/CPI in small print.
//
// Data notes (why it reads what it reads):
//   - Completion comes from the budget endpoint's taskStats, the same
//     counts the Budget tab shows, so the two surfaces can never
//     disagree (the v156 "counts agree" rule).
//   - The planned window mirrors portfolio.mts exactly: earliest
//     roadmap start (or end) to latest roadmap end (or start).
//   - The breakdown groups tasks by phase from the strongest structure
//     present: WBS parents first, then WBS numbers in the task titles
//     (v165.1, guarded -- see workGroups), then status for a flat,
//     unnumbered list. Cost entries carry no category or phase in the
//     data model, so there is no per-phase spend split -- the budget
//     card shows the one honest variance (whole project, planned vs
//     spent) plus spend by month from the entries' dates.
//   - The forecast and the Advanced indexes render only when the EVM
//     metrics exist (the v158 hiding rule): no dated plan or no costs,
//     no indexes, just a sentence saying what would create them.

const ADVANCED_KEY = "tasketra.cockpitAdvanced";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayKey(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Spend grouped by month from the cost entries' incurred dates,
 *  oldest first, with the running total through each month. */
export function spendByMonth(entries: BudgetData["costEntries"]): { key: string; label: string; amount: number; running: number }[] {
  const sums = new Map<string, number>();
  for (const e of entries) {
    const key = monthKeyOf(e.incurred_date.slice(0, 10));
    sums.set(key, (sums.get(key) ?? 0) + e.amount);
  }
  let running = 0;
  return [...sums.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, amount]) => {
      running += amount;
      const [y, m] = key.split("-").map(Number);
      return { key, label: `${MONTH_NAMES[m - 1]} ${y}`, amount, running };
    });
}

export function ProjectCockpit({ projectId, onOpenTab }: {
  projectId: string;
  onOpenTab: (tab: string) => void;
}) {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [advanced, setAdvanced] = useState<boolean>(() => {
    try { return localStorage.getItem(ADVANCED_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    let live = true;
    // The cockpit is additive: any fetch failing just leaves it out
    // rather than breaking the Overview it sits on.
    api.getBudget(projectId).then((d) => { if (live) setBudget(d); }).catch(() => { if (live) setBudget(null); });
    api.listTasks(projectId).then((d) => { if (live) setTasks(d.tasks); }).catch(() => { if (live) setTasks(null); });
    api.listRoadmapItems(projectId).then((d) => { if (live) setItems(d.items); }).catch(() => { if (live) setItems(null); });
    return () => { live = false; };
  }, [projectId]);

  if (!budget && !tasks && !items) return null;

  const total = budget?.taskStats.totalTasks ?? tasks?.length ?? 0;
  const done = budget?.taskStats.doneTasks ?? tasks?.filter((t) => t.status === "done").length ?? 0;
  const bac = budget?.budgetAtCompletion ?? null;
  const ac = budget?.metrics.ac ?? 0;
  const metrics = budget?.metrics;
  const window = items ? plannedWindow(items) : null;
  const { groups, byStatus } = tasks && total > 0 ? workGroups(tasks) : { groups: [] as WorkGroup[], byStatus: false };
  const months = budget ? spendByMonth(budget.costEntries) : [];
  const hasBudgetStory = bac !== null || ac > 0 || months.length > 0;

  const timeGauge = (() => {
    if (!window) {
      return (
        <div className="dash-viz-card">
          <p className="muted" style={{ margin: 0 }}>
            No roadmap dates yet, so there is no planned span to measure time against.{" "}
            <button type="button" className="view-banner-link" onClick={() => onOpenTab("roadmap")}>Open the Roadmap</button>
          </p>
        </div>
      );
    }
    const span = daysBetween(window.start, window.end);
    const elapsed = Math.max(0, Math.min(span, daysBetween(window.start, todayKey())));
    const words = todayKey() < window.start
      ? `${span} planned days · ${fmtLocalDate(window.start)} to ${fmtLocalDate(window.end)}`
      : `${elapsed} of ${span} planned days used · finishes ${fmtLocalDate(window.end)}`;
    return (
      <div className="dash-viz-card">
        <Gauge label="Time used" percent={(elapsed / span) * 100} tone="brand" value={`${Math.round((elapsed / span) * 100)}%`} words={words} />
      </div>
    );
  })();

  return (
    <section aria-label="Project cockpit" style={{ marginBottom: 20 }}>
      <div className="cockpit-head">
        <h3>The full picture</h3>
        <label className="cockpit-advanced">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(e) => {
              setAdvanced(e.target.checked);
              try { localStorage.setItem(ADVANCED_KEY, e.target.checked ? "1" : "0"); } catch { /* private mode */ }
            }}
          />{" "}
          Advanced
        </label>
      </div>

      <div className="dash-gauges" style={{ marginBottom: 16 }}>
        {total > 0 ? (
          <div className="dash-viz-card">
            <Gauge
              label="Completion"
              percent={(done / total) * 100}
              tone="brand"
              value={`${Math.round((done / total) * 100)}%`}
              words={`${done} of ${total} tasks done`}
            />
          </div>
        ) : (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>
              No tasks yet, so there is nothing to measure.{" "}
              <button type="button" className="view-banner-link" onClick={() => onOpenTab("tasks")}>Add the first tasks</button>
            </p>
          </div>
        )}
        {timeGauge}
        {bac !== null && (
          <div className="dash-viz-card">
            <Gauge
              label="Budget used"
              percent={bac > 0 ? (ac / bac) * 100 : 0}
              tone={bac > 0 && ac > bac ? "crit" : "brand"}
              value={bac > 0 ? `${Math.round((ac / bac) * 100)}%` : "—"}
              words={`${fmtMoney(ac)} of ${fmtMoney(bac)} spent`}
            />
          </div>
        )}
        {bac === null && ac > 0 && (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>
              {fmtMoney(ac)} spent so far, with no budget set to measure it against.{" "}
              <button type="button" className="view-banner-link" onClick={() => onOpenTab("budget")}>Set the budget</button>
            </p>
          </div>
        )}
        {bac === null && ac === 0 && (
          <div className="dash-viz-card">
            <p className="muted" style={{ margin: 0 }}>
              No budget or costs yet.{" "}
              <button type="button" className="view-banner-link" onClick={() => onOpenTab("budget")}>Open the Budget tab</button>
            </p>
          </div>
        )}
      </div>

      {(total > 0 || hasBudgetStory) && (
        <div className="dash-viz-grid cockpit-grid" style={{ marginBottom: 16 }}>
          {total > 0 && groups.length > 0 && (
            <div className="dash-viz-card">
              <h3>{byStatus ? "Work by status" : "Work breakdown"}</h3>
              <Donut
                segments={groups.map((g) => ({ label: g.label, value: g.total }))}
                colors={groups.map((_, i) => categoricalColor(i))}
                centerValue={String(total)}
                centerLabel={total === 1 ? "task" : "tasks"}
                ariaLabel={`Work breakdown: ${groups.map((g) => `${g.label}, ${g.total} of ${total} tasks`).join("; ")}`}
              />
              <table className="cockpit-table">
                <thead>
                  <tr><th>{byStatus ? "Status" : "Phase"}</th><th>Done</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.label}>
                      <td>{g.label}</td>
                      <td>{byStatus ? `${g.total} of ${total}` : `${g.done} of ${g.total}`}</td>
                      <td>{Math.round((g.total / total) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="dash-viz-card">
            <h3>Budget</h3>
            {bac !== null ? (
              <>
                <VarianceBars
                  rows={[{ id: "whole-project", label: "Whole project", planned: bac, actual: ac }]}
                  formatValue={(n) => fmtMoney(n)}
                  actualWord="Spent"
                />
                {metrics?.eac != null && ac > 0 && (
                  <div className="cockpit-forecast">
                    <div className="cockpit-forecast-label">Forecast at finish</div>
                    <div className="cockpit-forecast-value">{fmtMoney(metrics.eac)}</div>
                    <div className="muted">
                      {(() => {
                        const vac = metrics.vac ?? bac - metrics.eac;
                        return vac >= 0
                          ? `${fmtMoney(vac)} under the ${fmtMoney(bac)} budget if the current pace holds`
                          : `${fmtMoney(-vac)} over the ${fmtMoney(bac)} budget if the current pace holds`;
                      })()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                No budget set yet, so there is no plan to vary against.{" "}
                <button type="button" className="view-banner-link" onClick={() => onOpenTab("budget")}>Set the budget</button>
              </p>
            )}
            {months.length > 0 && (
              <table className="cockpit-table" style={{ marginTop: 14 }}>
                <thead>
                  <tr><th>Month</th><th>Spent</th><th>Total so far</th></tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td>{fmtMoney(m.amount)}</td>
                      <td>{fmtMoney(m.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ margin: "12px 0 0" }}>
              <button type="button" className="view-banner-link" onClick={() => onOpenTab("budget")}>Open the Budget tab</button>
            </p>
          </div>
        </div>
      )}

      {advanced && (
        <div className="dash-viz-card" style={{ marginBottom: 16 }}>
          <h3>Schedule and budget health</h3>
          {metrics && (metrics.spi != null || metrics.cpi != null) ? (
            <>
              <div className="dash-gauges dash-gauges-two" style={{ marginBottom: 0 }}>
                {metrics.spi != null && (
                  <div>
                    <Gauge
                      label="Schedule health"
                      percent={metrics.spi * 100}
                      tone={metrics.spi >= 1 ? "good" : metrics.spi >= 0.9 ? "warn" : "crit"}
                      value={`${Math.round(metrics.spi * 100)}%`}
                      words={metrics.spi >= 1 ? "Ahead of the planned pace" : "Behind the planned pace"}
                    />
                    <div className="cockpit-index">SPI {metrics.spi.toFixed(2)}</div>
                  </div>
                )}
                {metrics.cpi != null && (
                  <div>
                    <Gauge
                      label="Budget health"
                      percent={metrics.cpi * 100}
                      tone={metrics.cpi >= 1 ? "good" : metrics.cpi >= 0.9 ? "warn" : "crit"}
                      value={`${Math.round(metrics.cpi * 100)}%`}
                      words={metrics.cpi >= 1 ? "Under spent for the work done" : "Over spent for the work done"}
                    />
                    <div className="cockpit-index">CPI {metrics.cpi.toFixed(2)}</div>
                  </div>
                )}
              </div>
              <p className="muted" style={{ margin: "10px 0 0" }}>
                The indexes compare the work actually done with the plan and the spend. 1.00 means exactly on pace.
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Schedule and budget health need dated tasks and logged costs. Once both exist, the indexes appear here.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
