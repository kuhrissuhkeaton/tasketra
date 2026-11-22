// v172 (Plan A, "Layer It"): the shared building blocks every layered
// surface is made from, so Risks, Budget, Decisions and the rest are one
// kit, not eleven one-offs. Three ideas from the research: lead with a
// summary (StatCards), group the detail and let groups collapse
// (LayerGroup), and keep teaching text behind a user-triggered
// disclosure (HowItWorks) or in an empty state that teaches (TeachEmpty).
//
// LayerGroup remembers its open state per group id in localStorage,
// following the dashPrefs pattern, so a group a user collapsed stays
// collapsed on the next visit.

import { useId, useState } from "react";
import { Link } from "react-router-dom";

export function StatCards({ children }: { children: React.ReactNode }) {
  return <div className="layer-stats">{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "bad" | "ok";
  onClick?: () => void;
}) {
  const cls = `layer-stat${tone ? ` layer-stat-${tone}` : ""}`;
  const inner = (
    <>
      <span className="layer-stat-label">{label}</span>
      <span className="layer-stat-value">{value}</span>
      {sub && <span className="layer-stat-sub">{sub}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`${cls} layer-stat-btn`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function readGroupOpen(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function LayerGroup({
  id,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const key = `tasketra:layer:${id}`;
  const [open, setOpen] = useState<boolean>(() => readGroupOpen(key, defaultOpen));
  const panelId = useId();
  const headId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // session-only is fine
    }
  }

  return (
    <section className="layer-group" aria-labelledby={headId}>
      <h3 className="layer-group-head" id={headId}>
        <button
          type="button"
          className="layer-group-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className={`layer-group-chev${open ? " is-open" : ""}`} aria-hidden="true">
            ▸
          </span>
          <span className="layer-group-title">{title}</span>
          {typeof count === "number" && <span className="layer-group-count">{count}</span>}
        </button>
      </h3>
      <div id={panelId} className="layer-group-body" hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}

/**
 * The teaching-text disclosure: one quiet line on the working surface
 * ("How risks work"), the explanation appears only when asked for, and a
 * Learn link is offered when a full article exists. `article` is a Learn
 * article slug; the link lands on /app/resources?article=<slug>.
 */
export function HowItWorks({
  label,
  article,
  children,
}: {
  label: string;
  article?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="layer-how">
      <button
        type="button"
        className="layer-how-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div id={panelId} className="layer-how-body" hidden={!open}>
        {open && (
          <>
            <div className="layer-how-text">{children}</div>
            {article && (
              <Link className="layer-how-link" to={`/app/resources?article=${article}`}>
                Read more in Learn
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** An empty state that teaches: what this is, why it matters, one action. */
export function TeachEmpty({
  title,
  body,
  actionLabel,
  onAction,
  article,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  article?: string;
}) {
  return (
    <div className="layer-empty">
      <p className="layer-empty-title">{title}</p>
      <p className="layer-empty-body">{body}</p>
      <div className="layer-empty-actions">
        {actionLabel && onAction && (
          <button type="button" className="btn btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {article && (
          <Link className="btn-link" to={`/app/resources?article=${article}`}>
            How this works
          </Link>
        )}
      </div>
    </div>
  );
}
