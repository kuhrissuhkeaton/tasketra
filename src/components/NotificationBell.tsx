import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { api, type NotificationItem } from "../lib/api";
import { CHANGES } from "../lib/whatsNewData";
import { badgeText, unseenWhatsNew } from "../lib/notifications";

const LATEST_VERSION = CHANGES[0]?.version ?? null;
const MAX_NEW_ENTRIES = 3;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The bell in the sidebar header. Lists new What's new entries, answered
 * decisions, updates on the person's own feedback and (admin only) untriaged
 * feedback. Fetches on load, when the tab regains focus and when opened --
 * never on a timer, to keep function calls down. If the request fails it
 * quietly shows nothing.
 */
export function NotificationBell() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [seenVersion, setSeenVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.whatsNewSeen == null && LATEST_VERSION) {
        // A brand-new account: start from today's latest entry, so the first
        // dot they ever see is for something that ships after they joined.
        setSeenVersion(LATEST_VERSION);
        api.setWhatsNewSeen(LATEST_VERSION).catch(() => {});
      } else {
        setSeenVersion(data.whatsNewSeen ?? null);
      }
    } catch {
      /* quiet: no bell content is better than an error in the sidebar */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function onVisible() { if (document.visibilityState === "visible") void load(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const newEntries = unseenWhatsNew(CHANGES, seenVersion);

  // Reading the What's new page counts as seeing every entry on it.
  useEffect(() => {
    if (pathname === "/app/whats-new" && LATEST_VERSION && newEntries.length > 0) {
      setSeenVersion(LATEST_VERSION);
      api.setWhatsNewSeen(LATEST_VERSION).catch(() => {});
    }
  }, [pathname, newEntries.length]);

  // Going somewhere closes the panel.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unreadCount = newEntries.length + items.filter((i) => i.unread).length;
  const badge = badgeText(unreadCount);

  function toggle() {
    setOpen((o) => {
      if (!o) void load();
      return !o;
    });
  }

  async function markAllRead() {
    setItems((list) => list.map((i) => ({ ...i, unread: false })));
    if (LATEST_VERSION) setSeenVersion(LATEST_VERSION);
    try {
      await api.markNotificationsRead();
      if (LATEST_VERSION) await api.setWhatsNewSeen(LATEST_VERSION);
    } catch {
      void load();
    }
  }

  const shownEntries = newEntries.slice(0, MAX_NEW_ENTRIES);
  const extra = newEntries.length - shownEntries.length;
  const empty = shownEntries.length === 0 && items.length === 0;

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="sidebar-bell-btn"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {badge && <span className="sidebar-bell-badge" aria-hidden="true">{badge}</span>}
      </button>
      {open && createPortal(
        <div ref={panelRef} className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <button type="button" className="notif-markall" onClick={markAllRead} disabled={unreadCount === 0}>
              Mark all read
            </button>
          </div>
          {empty ? (
            <p className="notif-empty muted">You're all caught up.</p>
          ) : (
            <ul className="notif-list">
              {shownEntries.map((c) => (
                <li key={c.version}>
                  <Link to="/app/whats-new" className="notif-item notif-unread">
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text">New in Tasketra: {c.title}</span>
                    <span className="notif-when muted">{c.version}</span>
                  </Link>
                </li>
              ))}
              {extra > 0 && (
                <li>
                  <Link to="/app/whats-new" className="notif-item notif-unread">
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text">and {extra} more in What's new</span>
                  </Link>
                </li>
              )}
              {items.map((i) => (
                <li key={i.id}>
                  <Link to={i.to} className={i.unread ? "notif-item notif-unread" : "notif-item"}>
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text">{i.text}</span>
                    <span className="notif-when muted">{timeAgo(i.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
