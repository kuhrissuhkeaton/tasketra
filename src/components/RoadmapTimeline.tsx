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

// A small, distinct accent color per item type, independent of the status
// color used for a bar/marker's fill. Status already answers "what state is
// it in" via fill color; this answers "what kind of thing is this" via a
// left-edge stripe (bars) or a ring (markers), so type reads at a glance
// instead of only on hover.
const ROADMAP_TYPE_COLOR: Record<RoadmapItem["type"], string> = {
  phase: "#6E56A5",
  milestone: "#B4790C",
  release: "#2E7D89",
  event: "#B04C6A",
  note: "#5C6B73",
};

// DATE columns come back from the API as full ISO timestamps
// ("2026-08-01T00:00:00.000Z"), not bare date strings -- slicing to the
// first 10 chars before re-appending a time makes this safe for both that
// shape and a plain "2026-08-01" string, instead of producing "...ZT00:00:00"
// (a malformed string that silently parses to Invalid Date).
function toLocalDate(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00`);
}

export function fmtRoadmapDate(d: string | null): string {
  if (!d) return "--";
  return toLocalDate(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A marker (no end date, e.g. most milestones) now draws a visible label,
// not just a hover tooltip -- so unlike before, it occupies real horizontal
// space once rendered. This estimates that space in days at the current
// zoom, purely so packLanes below can keep two nearby markers' labels from
// stacking into an unreadable overlap; it's a rough character-count guess,
// not a real duration, and never touches the item's actual dates.
function estimateMarkerSpanDays(title: string, pxPerDay: number): number {
  const estimatedLabelPx = 18 + title.length * 6.2;
  return Math.max(1, Math.ceil(estimatedLabelPx / pxPerDay));
}

// Greedy interval packing: assigns each dated item in a swimlane to the
// first sub-lane whose last-placed item doesn't overlap it, so items that
// overlap in time (or, for an undated marker, in estimated label width)
// stack into extra rows instead of drawing on top of each other. Same idea
// real Gantt tools use for lane packing.
function packLanes(items: RoadmapItem[], pxPerDay: number): { item: RoadmapItem; lane: number }[] {
  const sorted = [...items].sort((a, b) => (a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : 0));
  const laneEnds: string[] = [];
  const placements: { item: RoadmapItem; lane: number }[] = [];
  for (const item of sorted) {
    let end: string;
    if (item.end_date) {
      end = item.end_date;
    } else {
      const d = toLocalDate(item.start_date!);
      d.setDate(d.getDate() + estimateMarkerSpanDays(item.title, pxPerDay));
      end = d.toISOString();
    }
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

export function RoadmapTimeline({
  items,
  onSelect,
}: {
  items: RoadmapItem[];
  onSelect?: (item: RoadmapItem) => void;
}) {
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
    toLocalDate(i.start_date!).getTime(),
    toLocalDate(i.end_date || i.start_date!).getTime(),
  ]);
  const minDate = new Date(Math.min(...times));
  const maxDate = new Date(Math.max(...times));
  minDate.setDate(minDate.getDate() - 10);
  maxDate.setDate(maxDate.getDate() + 14);

  const totalDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / 86400000));
  const pxPerDay = totalDays > 400 ? 3 : totalDays > 200 ? 4.5 : 6;
  const trackWidth = totalDays * pxPerDay;

  function dayOffset(dateStr: string) {
    return Math.round((toLocalDate(dateStr).getTime() - minDate.getTime()) / 86400000);
  }

  const todayOffset = dayOffset(new Date().toISOString().slice(0, 10));

  const monthTicks: { offset: number; label: string }[] = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor.getTime() <= maxDate.getTime()) {
    const offset = Math.round((cursor.getTime() - minDate.getTime()) / 86400000);
    monthTicks.push({ offset, label: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }) });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Undated items ride along in their swimlane's row (a trailing column)
  // instead of a separate list disconnected from the chart -- so "this
  // swimlane's dated items" and "this swimlane's undated items" read as one
  // picture. Grouped by lane first so each row's height calc below can
  // account for how many chips it needs to fit.
  const undatedByLane = new Map<string, RoadmapItem[]>();
  for (const item of undated) {
    if (!undatedByLane.has(item.swimlane)) undatedByLane.set(item.swimlane, []);
    undatedByLane.get(item.swimlane)!.push(item);
  }

  const swimlaneData = swimlanes.map((lane) => {
    const laneItems = dated.filter((i) => i.swimlane === lane);
    const placements = packLanes(laneItems, pxPerDay);
    const maxLane = placements.reduce((m, p) => Math.max(m, p.lane), 0);
    const datedHeight = (maxLane + 1) * 30;
    const laneUndated = undatedByLane.get(lane) || [];
    // Rough estimate of how many lines the undated chips will wrap to in the
    // undated column -- exact wrapping is a DOM-layout question, this only
    // needs to be a reasonable lower bound so the row doesn't clip, since
    // the same rowHeight drives the labels, track, and undated columns for
    // this lane and keeps their row boundaries aligned across all three.
    const undatedLines = laneUndated.length === 0 ? 0 : Math.max(1, Math.ceil(laneUndated.length / 1.6));
    const undatedHeight = undatedLines * 24 + 8;
    return { lane, placements, rowHeight: Math.max(datedHeight, undatedHeight) };
  });

  return (
    <div>
      <div className="gantt-wrap">
        <div className="gantt-labels roadmap-labels">
          <div className="gantt-header-spacer" />
          {swimlaneData.map(({ lane, rowHeight }) => (
            <div key={lane} className="roadmap-label-row" style={{ height: rowHeight }} title={lane}>
              {lane}
            </div>
          ))}
        </div>
        <div className="gantt-track-wrap roadmap-track-wrap">
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
                  const typeColor = ROADMAP_TYPE_COLOR[item.type];
                  if (!item.end_date) {
                    return (
                      <div
                        key={item.id}
                        className="roadmap-marker-wrap"
                        style={{ left: startOffset * pxPerDay - 6, top, cursor: onSelect ? "pointer" : undefined }}
                        onClick={onSelect ? () => onSelect(item) : undefined}
                      >
                        <div
                          className={`roadmap-marker gantt-bar-${item.status}`}
                          style={{ borderColor: typeColor }}
                          title={`${ROADMAP_TYPE_LABEL[item.type]}: ${item.title} -- ${fmtRoadmapDate(item.start_date)}`}
                        />
                        <span className="roadmap-marker-label" title={item.description || ""}>
                          {item.title}
                        </span>
                      </div>
                    );
                  }
                  const endOffset = dayOffset(item.end_date);
                  const left = startOffset * pxPerDay;
                  const width = Math.max((endOffset - startOffset) * pxPerDay, 10);
                  return (
                    <div
                      key={item.id}
                      className={`roadmap-bar gantt-bar-${item.status}`}
                      style={{ left, width, top, borderLeftColor: typeColor, cursor: onSelect ? "pointer" : undefined }}
                      title={`${ROADMAP_TYPE_LABEL[item.type]}: ${item.title} (${fmtRoadmapDate(item.start_date)} → ${fmtRoadmapDate(item.end_date)})`}
                      onClick={onSelect ? () => onSelect(item) : undefined}
                    >
                      <span className="roadmap-bar-label">{item.title}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {undated.length > 0 && (
          <div className="gantt-undated-col">
            <div className="gantt-header-spacer gantt-undated-col-head">Undated</div>
            {swimlaneData.map(({ lane, rowHeight }) => (
              <div key={lane} className="roadmap-undated-row" style={{ height: rowHeight }}>
                {(undatedByLane.get(lane) || []).map((item) => (
                  <span key={item.id} className="pill pill-navy roadmap-undated-chip" title={item.description || ""}>
                    {ROADMAP_TYPE_LABEL[item.type]}: {item.title}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="gantt-legend">
        <span><span className="gantt-swatch gantt-bar-not_started" /> Not started</span>
        <span><span className="gantt-swatch gantt-bar-in_progress" /> In progress</span>
        <span><span className="gantt-swatch gantt-bar-blocked" /> Blocked</span>
        <span><span className="gantt-swatch gantt-bar-done" /> Done</span>
      </div>
      <div className="gantt-legend gantt-legend-types">
        {(Object.keys(ROADMAP_TYPE_LABEL) as RoadmapItem["type"][]).map((t) => (
          <span key={t}>
            <span className="gantt-swatch" style={{ background: ROADMAP_TYPE_COLOR[t] }} /> {ROADMAP_TYPE_LABEL[t]}
          </span>
        ))}
      </div>
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
