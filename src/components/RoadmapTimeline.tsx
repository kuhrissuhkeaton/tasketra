import type { RoadmapItem } from "../lib/api";

// Shared between the owner-facing Roadmap tab (ProjectHome.tsx) and the
// public read-only share page (RoadmapPublic.tsx) so the two views can never
// visually drift apart -- an exec looking at the shared link sees the same
// timeline the PM is editing, just without the edit controls.

export const ROADMAP_TYPE_LABEL: Record<RoadmapItem["type"], string> = {
  phase: "Phase",
  milestone: "Milestone",
  release: "Release",
  event: "Event",
  note: "Note",
};

export const ROADMAP_STATUS_LABEL: Record<RoadmapItem["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export function fmtRoadmapDate(d: string | null): string {
  if (!d) return "--";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Greedy interval packing: assigns each dated item in a swimlane to the
// first sub-lane whose last-placed item doesn't overlap it, so items that
// overlap in time stack into extra rows instead of drawing on top of each
// other. Same idea real Gantt tools use for lane packing.
function packLanes(items: RoadmapItem[]): { item: RoadmapItem; lane: number }[] {
  const sorted = [...items].sort((a, b) => (a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : 0));
  const laneEnds: string[] = [];
  const placements: { item: RoadmapItem; lane: number }[] = [];
  for (const item of sorted) {
    const end = item.end_date || item.start_date!;
    let placedLane = -1;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] < item.start_date!) {
        laneEnds[l] = end;
        placedLane = l;
        break;
      }
    }
    if (placedLane === -1) {
      laneEnds.push(end);
      placedLane = laneEnds.length - 1;
    }
    placements.push({ item, lane: placedLane });
  }
  return placements;
}

export function RoadmapTimeline({ items }: { items: RoadmapItem[] }) {
  const dated = items.filter((i) => i.start_date);
  const undated = items.filter((i) => !i.start_date);
  const swimlanes = Array.from(new Set(items.map((i) => i.swimlane))).sort();

  if (dated.length === 0) {
    return (
      <div>
        {undated.length > 0 ? (
          <UndatedList items={undated} />
        ) : (
          <p className="muted">No roadmap items yet.</p>
        )}
      </div>
    );
  }

  const times = dated.flatMap((i) => [
    new Date(`${i.start_date}T00:00:00`).getTime(),
    new Date(`${i.end_date || i.start_date}T00:00:00`).getTime(),
  ]);
  const minDate = new Date(Math.min(...times));
  const maxDate = new Date(Math.max(...times));
  minDate.setDate(minDate.getDate() - 10);
  maxDate.setDate(maxDate.getDate() + 14);

  const totalDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / 86400000));
  const pxPerDay = totalDays > 400 ? 3 : totalDays > 200 ? 4.5 : 6;
  const trackWidth = totalDays * pxPerDay;

  function dayOffset(dateStr: string) {
    return Math.round((new Date(`${dateStr}T00:00:00`).getTime() - minDate.getTime()) / 86400000);
  }

  const todayOffset = dayOffset(new Date().toISOString().slice(0, 10));

  const monthTicks: { offset: number; label: string }[] = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor.getTime() <= maxDate.getTime()) {
    const offset = Math.round((cursor.getTime() - minDate.getTime()) / 86400000);
    monthTicks.push({ offset, label: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }) });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const swimlaneData = swimlanes.map((lane) => {
    const laneItems = dated.filter((i) => i.swimlane === lane);
    const placements = packLanes(laneItems);
    const maxLane = placements.reduce((m, p) => Math.max(m, p.lane), 0);
    return { lane, placements, rowHeight: (maxLane + 1) * 30 };
  });

  return (
    <div>
      <div className="gantt-wrap">
        <div className="gantt-labels">
          <div className="gantt-header-spacer" />
          {swimlaneData.map(({ lane, rowHeight }) => (
            <div key={lane} className="roadmap-label-row" style={{ height: rowHeight }} title={lane}>
              {lane}
            </div>
          ))}
        </div>
        <div className="gantt-track-wrap">
          <div style={{ width: trackWidth, position: "relative" }}>
            <div className="gantt-header" style={{ width: trackWidth }}>
              {monthTicks.map((tick) => (
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
            {swimlaneData.map(({ lane, placements, rowHeight }) => (
              <div key={lane} className="roadmap-row" style={{ width: trackWidth, height: rowHeight }}>
                {placements.map(({ item, lane: laneIdx }) => {
                  const startOffset = dayOffset(item.start_date!);
                  const top = 4 + laneIdx * 30;
                  if (!item.end_date) {
                    return (
                      <div
                        key={item.id}
                        className={`roadmap-marker gantt-bar-${item.status}`}
                        style={{ left: startOffset * pxPerDay - 6, top }}
                        title={`${ROADMAP_TYPE_LABEL[item.type]}: ${item.title} -- ${fmtRoadmapDate(item.start_date)}`}
                      />
                    );
                  }
                  const endOffset = dayOffset(item.end_date);
                  const left = startOffset * pxPerDay;
                  const width = Math.max((endOffset - startOffset) * pxPerDay, 10);
                  return (
                    <div
                      key={item.id}
                      className={`roadmap-bar gantt-bar-${item.status}`}
                      style={{ left, width, top }}
                      title={`${ROADMAP_TYPE_LABEL[item.type]}: ${item.title} (${fmtRoadmapDate(item.start_date)} → ${fmtRoadmapDate(item.end_date)})`}
                    >
                      <span className="roadmap-bar-label">{item.title}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="gantt-legend">
        <span><span className="gantt-swatch gantt-bar-not_started" /> Not started</span>
        <span><span className="gantt-swatch gantt-bar-in_progress" /> In progress</span>
        <span><span className="gantt-swatch gantt-bar-blocked" /> Blocked</span>
        <span><span className="gantt-swatch gantt-bar-done" /> Done</span>
      </div>
      {undated.length > 0 && <UndatedList items={undated} />}
    </div>
  );
}

function UndatedList({ items }: { items: RoadmapItem[] }) {
  const bySwimlane = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    if (!bySwimlane.has(item.swimlane)) bySwimlane.set(item.swimlane, []);
    bySwimlane.get(item.swimlane)!.push(item);
  }
  return (
    <div style={{ marginTop: 16 }}>
      <p className="settings-card-label">Undated</p>
      {Array.from(bySwimlane.entries()).map(([lane, laneItems]) => (
        <div key={lane} style={{ marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>{lane}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {laneItems.map((item) => (
              <span key={item.id} className="pill pill-navy roadmap-undated-chip" title={item.description || ""}>
                {ROADMAP_TYPE_LABEL[item.type]}: {item.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
