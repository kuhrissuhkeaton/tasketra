// The Dashboard's month calendar (v142): one dot per kind of dated thing on
// each day (a task due, a milestone, a decision waiting), and the selected
// day's list underneath. Data comes from the Dashboard via /api/my-calendar;
// all bucketing lives in src/lib/calendarItems.ts so it stays testable.
//
// Presentational apart from the selected day: the Dashboard owns the visible
// month and refetches when it changes, so the same items can also feed the
// "Needs a look" ages next door.

import { useState } from "react";
import { Link } from "react-router-dom";
import type { CalendarItem, CalendarItemKind } from "../lib/api";
import {
  groupItemsByDate,
  groupDayItems,
  kindsOnDay,
  monthCells,
  monthLabel,
  monthKeyOf,
  KIND_TAB,
} from "../lib/calendarItems";
import { fmtLocalDate } from "../lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const LEGEND: { kind: CalendarItemKind; label: string }[] = [
  { kind: "task", label: "Task due" },
  { kind: "milestone", label: "Milestone" },
  { kind: "decision", label: "Decision waiting" },
];

export function DashboardCalendar({
  items,
  month,
  todayKey,
  loading,
  onShiftMonth,
}: {
  items: CalendarItem[];
  /** Visible month, "YYYY-MM". */
  month: string;
  todayKey: string;
  loading: boolean;
  onShiftMonth: (delta: number) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  // The picked day only applies while it is in the visible month; otherwise
  // fall back to today (in this month) or the 1st, so the list under the grid
  // always matches the month on screen.
  const selected =
    picked && monthKeyOf(picked) === month
      ? picked
      : monthKeyOf(todayKey) === month
        ? todayKey
        : `${month}-01`;

  const byDate = groupItemsByDate(items);
  const cells = monthCells(month);
  const dayItems = byDate.get(selected) ?? [];
  const groups = groupDayItems(dayItems);
  const monthIsEmpty = items.length === 0;

  return (
    <section className="dash-cal" aria-label="Calendar">
      <div className="dash-cal-head">
        <h3 className="dash-cal-title">{monthLabel(month)}</h3>
        <div className="dash-cal-nav">
          <button type="button" className="btn btn-ghost btn-small" aria-label="Previous month" onClick={() => onShiftMonth(-1)}>
            ‹
          </button>
          <button type="button" className="btn btn-ghost btn-small" aria-label="Next month" onClick={() => onShiftMonth(1)}>
            ›
          </button>
        </div>
      </div>

      <div className="dash-cal-grid" role="grid" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="dash-cal-dow" aria-hidden="true">{d}</span>
        ))}
        {cells.map((cell) => {
          const dayList = byDate.get(cell.key) ?? [];
          const kinds = kindsOnDay(dayList);
          const isSelected = cell.key === selected;
          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              className={`dash-cal-cell${cell.inMonth ? "" : " dash-cal-out"}${cell.key === todayKey ? " dash-cal-today" : ""}${isSelected ? " dash-cal-selected" : ""}`}
              aria-pressed={isSelected}
              aria-label={`${fmtLocalDate(cell.key)}${dayList.length > 0 ? `, ${dayList.length} ${dayList.length === 1 ? "item" : "items"}` : ""}`}
              onClick={() => setPicked(cell.key)}
            >
              <span className="dash-cal-daynum">{cell.day}</span>
              <span className="dash-cal-dots" aria-hidden="true">
                {kinds.map((k) => (
                  <span key={k} className={`cal-dot cal-dot-${k}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="dash-cal-legend" aria-hidden="true">
        {LEGEND.map((l) => (
          <span key={l.kind} className="dash-cal-legend-item">
            <span className={`cal-dot cal-dot-${l.kind}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="dash-cal-daylist">
        <h4 className="dash-cal-dayhead">{fmtLocalDate(selected)}</h4>
        {loading && monthIsEmpty ? (
          <p className="muted">Loading…</p>
        ) : monthIsEmpty ? (
          <p className="muted">Nothing scheduled this month.</p>
        ) : dayItems.length === 0 ? (
          <p className="muted">Nothing due this day.</p>
        ) : (
          groups.map((g) => (
            <div key={g.kind} className="dash-cal-group">
              <h5 className="dash-cal-grouphead">{g.label}</h5>
              <ul className="dash-cal-rows">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <Link className="dash-cal-row" to={`/app/projects/${item.project_id}?tab=${KIND_TAB[item.kind]}`}>
                      <span className={item.kind === "milestone" && item.status === "done" ? "muted" : undefined}>
                        {item.title}
                      </span>
                      <span className="dash-cal-project">
                        {item.project_name}
                        {item.kind === "milestone" && item.status === "done" ? " · Done" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
