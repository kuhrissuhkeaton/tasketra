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
// Longest unbreakable thing we let a column insist on (a very long email or URL
// shouldn't force a column to half the screen).
const MAX_MIN_CONTENT = 260;
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

// The width a body cell needs to show everything on one line (same idea as
// labelNeededWidth, for a data cell). Used for the Actions column, whose links
// (Details, Delete, + Sub-task) must never be clipped.
function cellNeededWidth(td: HTMLElement): number {
  const prevWhiteSpace = td.style.whiteSpace;
  td.style.whiteSpace = "nowrap";
  const range = document.createRange();
  range.selectNodeContents(td);
  const contentWidth = range.getBoundingClientRect().width;
  const style = getComputedStyle(td);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  td.style.whiteSpace = prevWhiteSpace;
  return Math.ceil(contentWidth + padding) + 4;
}

// Each column's min-content width: the narrowest it can get before a word (or a
// select, tag or button) has to break or overflow. Under table-layout:auto the
// browser enforces this for free; once we switch to `fixed` it doesn't, which is
// how "Primary mover" ended up as "Primar/y mover". Measured by briefly shrinking
// the table to 1px wide in auto layout and reading what each header cell kept.
function measureMinContent(table: HTMLTableElement, ths: HTMLElement[]): number[] {
  const prevWidth = table.style.width;
  const prevLayout = table.style.tableLayout;
  table.style.tableLayout = "auto";
  table.style.width = "1px";
  const out = ths.map((th) => Math.min(MAX_MIN_CONTENT, Math.ceil(th.getBoundingClientRect().width)));
  table.style.width = prevWidth;
  table.style.tableLayout = prevLayout;
  return out;
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
  minColWidths,
  children,
}: {
  id: string;
  className?: string;
  style?: CSSProperties;
  /** Per-column floors in px (0 or missing = no floor). For columns holding
   *  controls or pills that must not be squeezed into overlapping their
   *  neighbours; the table scrolls sideways instead. */
  minColWidths?: number[];
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
    // A column with no header label is an Actions column (Details / Delete /
    // + Sub-task). Its links must never be clipped, so its width is never
    // allowed below what its widest row needs -- not by fitting to the box, and
    // not by a width saved in an earlier visit (saved before a link was added).
    const actionNeed = ths.map(() => 0);
    // Floors from the content itself (see measureMinContent). Skipped for the
    // header-less Actions column, which has its own, stricter floor below.
    const contentMin = measureMinContent(table, ths);
    const bodyRows = Array.from(table.querySelectorAll("tbody > tr"));
    ths.forEach((th, i) => {
      if (th.textContent?.trim()) return;
      for (const tr of bodyRows) {
        const td = tr.children[i] as HTMLElement | undefined;
        if (td && tr.children.length === ths.length) actionNeed[i] = Math.max(actionNeed[i], cellNeededWidth(td));
      }
      mins[i] = Math.max(mins[i], actionNeed[i]);
    });
    contentMin.forEach((w, i) => {
      mins[i] = Math.max(mins[i], w);
      actionNeed[i] = Math.max(actionNeed[i], w);
    });
    minColWidths?.forEach((w, i) => {
      if (w && i < mins.length) {
        mins[i] = Math.max(mins[i], w);
        actionNeed[i] = Math.max(actionNeed[i], w);
      }
    });
    const natural = fitColumns(
      ths.map((th) => th.getBoundingClientRect().width),
      mins,
      table.parentElement?.clientWidth ?? table.getBoundingClientRect().width
    );
    const hasSaved = !!saved && saved.length === ths.length;
    const initial = hasSaved ? saved.map((w, i) => Math.max(w, actionNeed[i])) : natural;
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
        updated[index] = Math.max(MIN_COL_WIDTH, actionNeed[index] ?? 0, Math.round(next));
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
