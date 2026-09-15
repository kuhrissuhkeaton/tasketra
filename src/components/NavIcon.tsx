import { createElement, type SVGProps } from "react";

/**
 * Nav icons -- the bold, lime-swatch treatment Karissa picked (Option C)
 * from the "Icons or Not" mock-up comparing the sidebar with and without
 * icons. Replaces NavDot everywhere it was used: the global Workspace
 * group in AppSidebar and every project-scoped side-tab in ProjectHome
 * (SECONDARY_NAV_GROUPS + Trash). Deliberately does NOT touch the primary
 * pill-bar tabs at the top of a project (Home/Roadmap/Tasks/RAID/Budget/
 * Meetings) -- those were never part of the no-icons discussion and stay
 * text-only pills as before.
 *
 * Each glyph is a simple original monoline shape (no external icon
 * library), drawn on a 20x20 grid to read clearly at the small size the
 * sidebar uses. Shapes are plain SVG primitives rather than raw path
 * strings so nothing here needs dangerouslySetInnerHTML.
 */

export type NavIconName =
  | "dashboard"
  | "resources"
  | "whatsnew"
  | "account"
  | "billing"
  | "waitlist"
  | "feedback"
  | "founding"
  | "stakeholders"
  | "decisions"
  | "team"
  | "documents"
  | "report"
  | "templates"
  | "export"
  | "connections"
  | "trash";

type Shape = { tag: "path" | "rect" | "circle"; attrs: SVGProps<SVGElement> };

const SHAPES: Record<NavIconName, Shape[]> = {
  dashboard: [
    { tag: "rect", attrs: { x: 3, y: 3, width: 6, height: 6, rx: 1.5 } },
    { tag: "rect", attrs: { x: 11, y: 3, width: 6, height: 6, rx: 1.5 } },
    { tag: "rect", attrs: { x: 3, y: 11, width: 6, height: 6, rx: 1.5 } },
    { tag: "rect", attrs: { x: 11, y: 11, width: 6, height: 6, rx: 1.5 } },
  ],
  resources: [
    { tag: "path", attrs: { d: "M10 6c-1.4-1-3.4-1.5-5.5-1.5-.6 0-1 .4-1 1v9c0 .6.4 1 1 1 2.1 0 4.1.5 5.5 1.5m0-11c1.4-1 3.4-1.5 5.5-1.5.6 0 1 .4 1 1v9c0 .6-.4 1-1 1-2.1 0-4.1.5-5.5 1.5m0-11v11" } },
  ],
  whatsnew: [
    { tag: "path", attrs: { d: "M6 8.5a4 4 0 0 1 8 0c0 3 1 4 1 4H5s1-1 1-4Z" } },
    { tag: "path", attrs: { d: "M8.5 15.3a1.5 1.5 0 0 0 3 0" } },
  ],
  account: [
    { tag: "circle", attrs: { cx: 10, cy: 7.3, r: 3 } },
    { tag: "path", attrs: { d: "M4 17c0-3 2.7-5 6-5s6 2 6 5" } },
  ],
  billing: [
    { tag: "rect", attrs: { x: 3, y: 5.5, width: 14, height: 9.5, rx: 1.5 } },
    { tag: "path", attrs: { d: "M3 8.8h14" } },
    { tag: "path", attrs: { d: "M6 12h3" } },
  ],
  waitlist: [
    { tag: "path", attrs: { d: "M4 5.5h8M4 10h8M4 14.5h5" } },
    { tag: "path", attrs: { d: "M14.5 13l1.4 1.4L19 11" } },
  ],
  feedback: [
    { tag: "path", attrs: { d: "M4 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" } },
  ],
  founding: [
    { tag: "path", attrs: { d: "M10 3.5l1.9 4 4.4.6-3.2 3.1.8 4.3L10 13.4l-3.9 2.1.8-4.3-3.2-3.1 4.4-.6Z" } },
  ],
  stakeholders: [
    { tag: "circle", attrs: { cx: 7, cy: 7.2, r: 2.5 } },
    { tag: "circle", attrs: { cx: 14, cy: 8.7, r: 2.1 } },
    { tag: "path", attrs: { d: "M2.5 17c0-2.7 2-4.4 4.5-4.4s4.5 1.7 4.5 4.4" } },
    { tag: "path", attrs: { d: "M11.7 17c.2-1.9 1.6-3.2 3.5-3.2 1.6 0 3 .8 3.4 2.3" } },
  ],
  decisions: [
    { tag: "circle", attrs: { cx: 10, cy: 4.5, r: 1.3 } },
    { tag: "path", attrs: { d: "M10 6.2v2.8" } },
    { tag: "path", attrs: { d: "M10 9l-4.3 6.7" } },
    { tag: "path", attrs: { d: "M10 9l4.3 6.7" } },
  ],
  team: [
    { tag: "circle", attrs: { cx: 7, cy: 8, r: 2.3 } },
    { tag: "circle", attrs: { cx: 13, cy: 8, r: 2.3 } },
    { tag: "circle", attrs: { cx: 10, cy: 13.3, r: 2.3 } },
  ],
  documents: [
    { tag: "path", attrs: { d: "M6 3h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" } },
    { tag: "path", attrs: { d: "M12 3v3h3" } },
    { tag: "path", attrs: { d: "M7.5 11h5M7.5 14h5" } },
  ],
  report: [
    { tag: "path", attrs: { d: "M3 17h14" } },
    { tag: "path", attrs: { d: "M5.5 16V10.5" } },
    { tag: "path", attrs: { d: "M10 16V6" } },
    { tag: "path", attrs: { d: "M14.5 16V9" } },
  ],
  templates: [
    { tag: "path", attrs: { d: "M10 3l7 3.5-7 3.5-7-3.5Z" } },
    { tag: "path", attrs: { d: "M3 11l7 3.5 7-3.5" } },
    { tag: "path", attrs: { d: "M3 14.5l7 3.5 7-3.5" } },
  ],
  export: [
    { tag: "path", attrs: { d: "M10 3v9" } },
    { tag: "path", attrs: { d: "M6.5 6.5 10 3l3.5 3.5" } },
    { tag: "path", attrs: { d: "M4 12.5v3.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5" } },
  ],
  connections: [
    { tag: "rect", attrs: { x: 3, y: 8.3, width: 8, height: 4.2, rx: 2.1, transform: "rotate(-35 7 10.4)" } },
    { tag: "rect", attrs: { x: 9, y: 6.3, width: 8, height: 4.2, rx: 2.1, transform: "rotate(-35 13 8.4)" } },
  ],
  trash: [
    { tag: "path", attrs: { d: "M4 6h12" } },
    { tag: "path", attrs: { d: "M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6" } },
    { tag: "path", attrs: { d: "M6 6l.8 10a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L14 6" } },
    { tag: "path", attrs: { d: "M9 9v5M11 9v5" } },
  ],
};

export function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  return (
    <span className={active ? "nav-icon-wrap active" : "nav-icon-wrap"} aria-hidden="true">
      <svg viewBox="0 0 20 20" className="nav-icon-glyph">
        {SHAPES[name].map((shape, i) => createElement(shape.tag, { key: i, ...shape.attrs }))}
      </svg>
    </span>
  );
}
