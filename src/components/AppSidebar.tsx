import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "./Wordmark";
import { FeedbackModal } from "./FeedbackModal";

/** Small square/round dot used in place of icons throughout nav --
 * the rebrand's visual language deliberately avoids icons. Square (3px
 * radius) for top-level pages, round (50%) for project-scoped items.
 * Colors are tuned for the navy sidebar: an active dot sits on a solid
 * gold pill so it needs to go dark to stay visible; an inactive dot sits
 * directly on navy so it needs a muted light tone instead of the old
 * light-tan-on-white value. */
export function NavDot({ active, shape = "3px" }: { active: boolean; shape?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: shape,
        background: active ? "var(--navy)" : "#6B7358",
        flexShrink: 0,
      }}
    />
  );
}

/** Collapsible nav section used by both the sidebar's own global group and
 * ProjectHome's secondary (non-pill-bar) groups -- clicking the label
 * toggles a chevron and shows/hides the items below it. On mobile the
 * items always render regardless of collapsed state (see the CSS media
 * query), since the label/chevron affordance is hidden there. */
export function NavGroup({
  label,
  children,
  defaultCollapsed = false,
}: {
  label: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={collapsed ? "side-nav-group collapsed" : "side-nav-group"}>
      <div
        className="side-nav-label collapsible"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed((c) => !c); } }}
      >
        {label}
        <span className="side-nav-chevron" aria-hidden="true">▾</span>
      </div>
      <div className="side-nav-items">{children}</div>
    </div>
  );
}

/**
 * The single persistent left-rail shell used by every logged-in screen --
 * Dashboard, Resource hub, Admin waitlist, and (with a project nav slot
 * passed as children) individual project pages. Keeps global navigation and
 * account controls in one place so the app always feels like one product,
 * not a set of disconnected top bars.
 */
export function AppSidebar({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <aside className="sidebar">
      <Link to="/app" className="sidebar-wordmark">
        <Wordmark size="sm" beta />
      </Link>

      <nav className="side-nav">
        <NavGroup label="Workspace" defaultCollapsed={!!children}>
          <Link to="/app" className={pathname === "/app" ? "side-tab active" : "side-tab"}>
            <NavDot active={pathname === "/app"} />
            Dashboard
          </Link>
          <Link
            to="/app/resources"
            className={pathname === "/app/resources" ? "side-tab active" : "side-tab"}
          >
            <NavDot active={pathname === "/app/resources"} />
            Resource hub
          </Link>
          <Link
            to="/app/whats-new"
            className={pathname === "/app/whats-new" ? "side-tab active" : "side-tab"}
          >
            <NavDot active={pathname === "/app/whats-new"} />
            What's new
          </Link>
          <Link
            to="/app/account"
            className={pathname === "/app/account" ? "side-tab active" : "side-tab"}
          >
            <NavDot active={pathname === "/app/account"} />
            Account
          </Link>
          <Link
            to="/app/billing"
            className={pathname === "/app/billing" ? "side-tab active" : "side-tab"}
          >
            <NavDot active={pathname === "/app/billing"} />
            Billing
          </Link>
          {user?.isAdmin && (
            <Link
              to="/admin/waitlist"
              className={pathname === "/admin/waitlist" ? "side-tab active" : "side-tab"}
            >
              <NavDot active={pathname === "/admin/waitlist"} />
              Waitlist
            </Link>
          )}
          {user?.isAdmin && (
            <Link
              to="/admin/feedback"
              className={pathname === "/admin/feedback" ? "side-tab active" : "side-tab"}
            >
              <NavDot active={pathname === "/admin/feedback"} />
              Feedback inbox
            </Link>
          )}
        </NavGroup>

        {children}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="side-tab sidebar-feedback"
          style={{ marginBottom: 4 }}
          onClick={() => setFeedbackOpen(true)}
        >
          <span aria-hidden="true" className="sidebar-feedback-dot" />
          Feedback
        </button>
        <a
          href="https://discord.gg/R66gSFz9d"
          target="_blank"
          rel="noopener noreferrer"
          className="side-tab"
          style={{ marginBottom: 4 }}
        >
          Community
        </a>
        <Link to="/legal" className="side-tab" style={{ marginBottom: 4 }}>
          Legal
        </Link>
        <div className="sidebar-user muted" title={user?.email}>{user?.email}</div>
        <button className="btn btn-ghost btn-block" type="button" onClick={() => logout()}>
          Sign out
        </button>
      </div>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </aside>
  );
}
