// Shared page pieces for the "Today look" (redesign foundation batch).
// Small, presentational, no data fetching. They reuse the existing tokens and the
// .tw-* / .page-head styles, so dark mode and the brand follow automatically.
//
// Guidelines they encode (see the Look Book): a big title with one muted line of
// real numbers; at most two header buttons; soft panel cards; every empty state has
// one clear action; list columns line up (status, flag and date each have a fixed
// column, so one extra item never shifts the rest).

import type { ReactNode } from "react";
import type { RowFlag } from "../lib/rowFlags";

/** Title, one muted summary line, and the header actions (keep it to two buttons, one primary). */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted tw-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}

/** A soft panel card. */
export function SoftCard({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tw-card${className ? ` ${className}` : ""}`}>
      {title ? <h2 className="ui-card-title">{title}</h2> : null}
      {children}
    </section>
  );
}

/** An empty state: one sentence and one clear action. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="tw-empty">
      <h2>{title}</h2>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export type PillTone = "green" | "gold" | "red" | "navy" | "neutral";

/** A small status pill. Colour is never the only signal: the text always says the status. */
export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** A list whose rows share fixed columns. Use ListRow children, and ListGroupHead to split days or groups. */
export function AlignedList({ label, children }: { label: string; children: ReactNode }) {
  return <ul className="ar-list" aria-label={label}>{children}</ul>;
}

export function ListGroupHead({ title, count }: { title: ReactNode; count?: ReactNode }) {
  return (
    <li className="ar-group-head">
      <h2>{title}{count !== undefined ? <> <span className="muted tw-count">{count}</span></> : null}</h2>
    </li>
  );
}

/**
 * One row: lead (optional, e.g. a checkbox), title + meta, then three fixed columns:
 * status, flag (e.g. "3 days late") and date. Empty columns are still rendered, so
 * the other columns stay in the same place on every row. On a phone the columns
 * drop under the title and empty ones disappear.
 */
export function ListRow({
  lead, title, meta, status, flag, date,
}: {
  lead?: ReactNode; title: ReactNode; meta?: ReactNode; status?: ReactNode; flag?: ReactNode; date?: ReactNode;
}) {
  return (
    <li className={`ar-row${lead ? " has-lead" : ""}`}>
      {lead ? <span className="ar-lead">{lead}</span> : null}
      <div className="ar-main">
        <div className="ar-title">{title}</div>
        {meta ? <div className="ar-meta muted">{meta}</div> : null}
      </div>
      <span className="ar-status" data-slot="status">{status}</span>
      <span className="ar-flag" data-slot="flag">{flag}</span>
      <span className="ar-date" data-slot="date">{date}</span>
    </li>
  );
}

/**
 * A register row (Issues, Risks, Assumptions, Dependencies, Quality, Compliance, Tasks).
 * Same idea as ListRow, with the controls a register needs: title + one plain line,
 * then fixed columns for the pill, the flag ("3 days late"), the date, the status
 * control and the row actions. Empty columns stay empty, so nothing ever shifts.
 */
export function RegisterRow({
  title, meta, pill, flag, date, dateLabel, control, actions, rowRef, lead, indent = 0,
}: {
  title: ReactNode; meta?: ReactNode; pill?: ReactNode; flag?: RowFlag | null; date?: ReactNode; dateLabel?: string;
  control?: ReactNode; actions?: ReactNode; rowRef?: (el: HTMLLIElement | null) => void; lead?: ReactNode; indent?: number;
}) {
  return (
    <li className="rg-row" ref={rowRef} style={indent ? { paddingLeft: indent * 20 } : undefined}>
      <div className="rg-main">
        {lead ? <span className="rg-lead">{lead}</span> : null}
        <div className="rg-text">
          <div className="rg-title">{title}</div>
          {meta ? <div className="rg-meta muted">{meta}</div> : null}
        </div>
      </div>
      <span className="rg-pill" data-slot="pill">{pill}</span>
      <span className={`rg-flag${flag?.bad ? " is-bad" : ""}`} data-slot="flag">{flag?.text}</span>
      <span className="rg-date" data-slot="date">{date ? (<>{dateLabel ? <span className="sr-only">{dateLabel} </span> : null}{date}</>) : null}</span>
      <span className="rg-control" data-slot="control">{control}</span>
      <span className="rg-actions" data-slot="actions">{actions}</span>
    </li>
  );
}

/** A quiet summary line under a tab's section pills: real numbers, e.g. "5 open · 2 high". */
export function RegisterSummary({ children }: { children: ReactNode }) {
  return <p className="rg-summary muted">{children}</p>;
}

/** The empty state for a register: one sentence. The add form above is the action. */
export function RegisterEmpty({ children }: { children: ReactNode }) {
  return <p className="rg-empty muted">{children}</p>;
}
