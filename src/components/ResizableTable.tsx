import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Drop-in replacement for `<table className="table">` that makes every
 * column drag-resizable and remembers the widths (per browser, keyed by
 * `id`) across visits. Fixes the "words get cut off and there's no way to
 * widen the column" complaint app-wide: every table (Tasks, RAID, Budget,
 * Roadmap, Meetings, Documents, Stakeholders, Change requests, Team,
 * Lessons learned, Trash, Dashboard, admin lists, Resources) uses this
 * same component, so one fix covers all of them.
 *
 * Usage: keep the exact same <thead>/<tbody> children, just swap the tag:
 *   <ResizableTable id="tasks"> ... same thead/tbody as before ... </ResizableTable>
 *
 * How it works: on mount, the table renders once with the browser's normal
 * automatic column sizing so we can measure each column's natural width
 * (merging in any widths saved from a previous visit), then switches the
 * table to `table-layout: fixed` with an explicit pixel width per column
 * via a <colgroup>. From then on, dragging the strip at the right edge of
 * a header cell resizes that column; double-clicking it auto-fits the
 * column to its current content. Column widths intentionally aren't
 * clamped to the container -- once a table's columns are wider than the
 * screen, the wrapper scrolls horizontally rather than re-compressing
 * everything, same as a spreadsheet.
 */

const MIN_COL_WIDTH = 64;
const MAX_AUTOFIT_WIDTH = 560;
const STORAGE_PREFIX = "tasketra:col-widths:";

function loadWidths(id: string): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number") ? parsed : null;
  } catch {
    return null;
  }
}

function saveWidths(id: string, widths: number[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(widths));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) -- resizing
    // still works for the session, it just won't persist.
  }
}

export function ResizableTable({
  id,
  className = "table",
  style,
  children,
}: {
  id: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const widthsRef = useRef<number[] | null>(null);
  widthsRef.current = widths;

  // Measure natural column widths once on mount (merging saved widths),
  // then wire up drag-to-resize and double-click-to-autofit on each header
  // cell. Runs once per mount -- table shape (column count) doesn't change
  // for a given `id` while it stays mounted.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const headerRow = table.querySelector("thead tr");
    const ths = headerRow ? (Array.from(headerRow.children) as HTMLElement[]) : [];
    if (ths.length === 0) return;

    const saved = loadWidths(id);
    // A column's starting width is never allowed to be narrower than its
    // own header label needs on one line -- table-layout:auto (the default
    // before this component switches to `fixed`) guarantees that for free,
    // but `fixed` layout doesn't, so a short unbreakable label like
    // "SEVERITY" or "STATUS" would otherwise start pre-wrapped into
    // "SEVERIT/Y" the moment a neighboring column (e.g. a long email with
    // no spaces to break on) claims more than its share under auto layout.
    const natural = ths.map((th) => {
      const renderedWidth = Math.round(th.getBoundingClientRect().width);
      const prevWhiteSpace = th.style.whiteSpace;
      th.style.whiteSpace = "nowrap";
      // A few extra px of slack: scrollWidth can undercount by a hair once
      // letter-spacing is in play (the trailing letter's spacing isn't
      // always included), which is just enough to force an unwanted wrap.
      const labelWidth = Math.ceil(th.scrollWidth) + 8;
      th.style.whiteSpace = prevWhiteSpace;
      return Math.max(MIN_COL_WIDTH, renderedWidth, labelWidth);
    });
    const initial = saved && saved.length === ths.length ? saved : natural;
    setWidths(initial);

    function widthOf(index: number): number {
      return widthsRef.current?.[index] ?? natural[index] ?? MIN_COL_WIDTH;
    }

    function setColumnWidth(index: number, next: number) {
      setWidths((prev) => {
        const base = prev ?? natural;
        const updated = base.slice();
        updated[index] = Math.max(MIN_COL_WIDTH, Math.round(next));
        return updated;
      });
    }

    function measureContentWidth(index: number): number {
      const cells = Array.from(table!.querySelectorAll(`tbody > tr`))
        .map((tr) => tr.children[index] as HTMLTableCellElement | undefined)
        .filter((cell): cell is HTMLTableCellElement => !!cell && cell.colSpan === 1);
      let max = ths[index].scrollWidth;
      for (const cell of cells) {
        const prevWhiteSpace = cell.style.whiteSpace;
        cell.style.whiteSpace = "nowrap";
        max = Math.max(max, cell.scrollWidth);
        cell.style.whiteSpace = prevWhiteSpace;
      }
      return max;
    }

    const cleanups: Array<() => void> = [];

    ths.forEach((th, index) => {
      th.classList.add("col-resizable");

      function onPointerDown(e: PointerEvent) {
        const rect = th.getBoundingClientRect();
        if (rect.right - e.clientX > 10) return; // only the handle strip at the right edge
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = widthOf(index);
        th.setPointerCapture(e.pointerId);
        th.classList.add("col-resizing");
        document.body.classList.add("col-resize-active");

        function onMove(ev: PointerEvent) {
          setColumnWidth(index, startWidth + (ev.clientX - startX));
        }
        function onUp(ev: PointerEvent) {
          th.releasePointerCapture(ev.pointerId);
          th.classList.remove("col-resizing");
          document.body.classList.remove("col-resize-active");
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (widthsRef.current) saveWidths(id, widthsRef.current);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }

      function onDoubleClick(e: MouseEvent) {
        const rect = th.getBoundingClientRect();
        if (rect.right - e.clientX > 10) return;
        const fit = Math.min(MAX_AUTOFIT_WIDTH, Math.max(MIN_COL_WIDTH, measureContentWidth(index) + 4));
        setColumnWidth(index, fit);
        if (widthsRef.current) saveWidths(id, widthsRef.current);
      }

      th.addEventListener("pointerdown", onPointerDown);
      th.addEventListener("dblclick", onDoubleClick);
      cleanups.push(() => {
        th.removeEventListener("pointerdown", onPointerDown);
        th.removeEventListener("dblclick", onDoubleClick);
      });
    });

    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalWidth = widths ? widths.reduce((sum, w) => sum + w, 0) : undefined;

  return (
    <div className="resizable-table-wrap" style={style}>
      <table
        ref={tableRef}
        className={className}
        style={widths ? { tableLayout: "fixed", width: totalWidth } : undefined}
      >
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        {children}
      </table>
    </div>
  );
}
