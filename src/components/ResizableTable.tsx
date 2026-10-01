import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fitColumns, refitColumns } from "../lib/fitColumns";

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
 * column to its current content. Until you size a column yourself, the
 * widths follow the container (a scrollbar appearing, a window resize), so
 * a table that fits never scrolls sideways. Once you drag a column, or a
 * saved layout is loaded, widths are yours: they aren't clamped to the
 * container, and a table wider than the screen scrolls horizontally, same
 * as a spreadsheet.
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

// The width a header cell needs to show its label on one line: the text's own
// width plus the cell's horizontal padding, with a few px of slack because
// letter-spacing isn't always fully counted. The text is measured with a
// Range, not th.scrollWidth: scrollWidth reports the whole cell's width
// whenever the label is narrower than the cell, which made every column
// claim 8px more than it needed and pushed any table with a handful of
// columns wider than its container, so it always scrolled sideways even
// when everything would have fit.
function labelNeededWidth(th: HTMLElement): number {
  const prevWhiteSpace = th.style.whiteSpace;
  th.style.whiteSpace = "nowrap";
  const range = document.createRange();
  range.selectNodeContents(th);
  const textWidth = range.getBoundingClientRect().width;
  const style = getComputedStyle(th);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  th.style.whiteSpace = prevWhiteSpace;
  return Math.ceil(textWidth + padding) + 8;
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
    // Start from the widths automatic layout gave each column, never narrower
    // than the label needs, and trim the roomier columns if that would push
    // the table past its container (fitColumns, unit tested).
    const mins = ths.map((th) => Math.max(MIN_COL_WIDTH, labelNeededWidth(th)));
    const natural = fitColumns(
      ths.map((th) => th.getBoundingClientRect().width),
      mins,
      table.parentElement?.clientWidth ?? table.getBoundingClientRect().width
    );
    const hasSaved = !!saved && saved.length === ths.length;
    const initial = hasSaved ? saved : natural;
    setWidths(initial);

    // Until the user sizes a column themselves, keep the table fitted to its
    // box as the box changes. The widths above are a snapshot taken at mount;
    // if the container shrinks afterwards (a page scrollbar appears once the
    // content loads, the window or a side panel resizes) a table that fit a
    // moment ago would otherwise grow a sideways scrollbar, and if it grows
    // the table would leave a gap. A user-set or saved layout is left alone:
    // that is the spreadsheet-style scrolling the header comment describes.
    let userSized = hasSaved;
    const box = table.parentElement;
    let observer: ResizeObserver | null = null;
    if (box && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (userSized) return;
        setWidths((prev) => {
          if (!prev) return prev;
          const next = refitColumns(prev, mins, box.clientWidth);
          return next.every((w, i) => w === prev[i]) ? prev : next;
        });
      });
      observer.observe(box);
    }

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
        userSized = true;
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
        userSized = true;
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

    return () => {
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
    };
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
