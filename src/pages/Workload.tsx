import { useEffect, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { api, type WorkloadData } from "../lib/api";
import { useDocumentTitle } from "../lib/documentTitle";
import { PageHeader, SoftCard } from "../components/ui";
import { addDays, localDateKey } from "../lib/today";
import { buildWorkloadGrid, type WorkloadRow } from "../lib/workloadGrid";
import { formatDateKey } from "../lib/syncRecap";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Nov 2" for a YYYY-MM-DD date key (the week column headers). */
function shortKey(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

/** Shading step for a week cell: blank, then three steps up as counts grow. */
function cellLevel(n: number): number {
  return n <= 0 ? 0 : Math.min(n, 3);
}

function WeekCell({ count }: { count: number }) {
  return <td className={`wl-cell wl-cell-${cellLevel(count)}`}>{count === 0 ? "—" : count}</td>;
}

function OwnerRow({ row }: { row: WorkloadRow }) {
  return (
    <tr>
      <td className="wl-owner">
        <span className="wl-owner-name">{row.owner}</span>
        {row.atRiskProjects > 0 && (
          <span className="wl-tag">
            Works on {row.atRiskProjects} at-risk {plural(row.atRiskProjects, "project", "projects")}
          </span>
        )}
      </td>
      <td className={`wl-cell wl-overdue${row.overdue > 0 ? " wl-overdue-hot" : ""}`}>
        {row.overdue === 0 ? "—" : row.overdue}
      </td>
      {row.weeks.map((n, i) => (
        <WeekCell key={i} count={n} />
      ))}
      <td className="wl-cell wl-open">{row.open}</td>
    </tr>
  );
}

export default function Workload() {
  useDocumentTitle("Workload");
  const [data, setData] = useState<WorkloadData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getWorkload().then(setData).catch(() => setError("Couldn't load your workload."));
  }, []);

  const todayKey = localDateKey(new Date());
  const grid = data ? buildWorkloadGrid(data.tasks, data.milestones, data.windowStart, todayKey) : null;
  const openTotal = grid ? grid.rows.reduce((sum, r) => sum + r.open, 0) : 0;
  // v151: the subtitle used to claim all open tasks sat "across the next
  // four weeks" -- the Open column counts undated and overdue work too.
  // Say both numbers with their real scopes.
  const datedInWindow = grid ? grid.rows.reduce((sum, r) => sum + r.weeks.reduce((a, b) => a + b, 0), 0) : 0;
  const milestoneCount = data ? data.milestones.length : 0;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader
          title="Workload"
          subtitle={grid
            ? `${grid.rows.length} ${plural(grid.rows.length, "owner", "owners")} · ${openTotal} open ${plural(openTotal, "task", "tasks")} · ${datedInWindow} due in the next four weeks`
            : "Loading your workload..."}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        {grid && data && (
          data.tasks.length === 0 ? (
            <SoftCard title="Workload" className="ui-narrow">
              <p className="muted">
                No open work right now. When tasks have owners and due dates, they
                will show up here week by week, so a heavy week is visible before
                it lands.
              </p>
            </SoftCard>
          ) : (
            <>
              <SoftCard title="Workload">
                <div className="wl-scroll">
                  <table className="wl-table">
                    <thead>
                      <tr>
                        <th scope="col" className="wl-owner-head">Owner</th>
                        <th scope="col">Overdue</th>
                        {grid.weekStarts.map((start) => (
                          <th scope="col" key={start}>
                            {shortKey(start)}
                            {/* v151 (Part F9): tag the week that CONTAINS
                                today, not always the first column -- the
                                window can start in the past. */}
                            {todayKey >= start && todayKey < addDays(start, 7) && <span className="wl-this-week">This week</span>}
                          </th>
                        ))}
                        <th scope="col">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grid.rows.map((row) => (
                        <OwnerRow key={row.owner} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="wl-note">
                  Owners are the names already on your tasks. A week counts the
                  tasks due in it from today onwards; anything earlier is in
                  Overdue, never counted twice.
                </p>
              </SoftCard>

              {milestoneCount > 0 && (
                <SoftCard title="Milestones in this window">
                  <ul className="wl-ms-list">
                    {grid.milestoneWeeks.map((week, i) =>
                      week.length === 0 ? null : (
                        <li className="wl-ms-row" key={grid.weekStarts[i]}>
                          <span className="wl-ms-week">Week of {formatDateKey(grid.weekStarts[i])}:</span>{" "}
                          <span className="wl-ms-items">
                            {week.slice(0, 2).map((ms) => `${ms.title} (${ms.projectName})`).join(" · ")}
                            {week.length > 2 && ` +${week.length - 2} more`}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </SoftCard>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
