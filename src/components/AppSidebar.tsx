import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "./Wordmark";

/** Small square/round dot used in place of icons throughout nav --
 * the rebrand's visual language deliberately avoids icons. Square (3px
 * radius) for top-level pages, round (50%) for project-scoped items. */
export function NavDot({ active, shape = "3px" }: { active: boolean; shape?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 9,
        height: 9,
        borderRadius: shape,
        background: active ? "var(--gold)" : "#DAD2B8",
        flexShrink: 0,
      }}
    />
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

  return (
    <aside className="sidebar">
      <Link to="/app" className="sidebar-wordmark">
        <Wordmark size="sm" beta />
      </Link>

      <nav className="side-nav">
        <div className="side-nav-group">
          <div className="side-nav-label">Workspace</div>
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
        </div>

        {children}
      </nav>

      <div className="sidebar-footer">
        <a
          href="mailto:mileskarissa@gmail.com?subject=Tasketra%20feedback"
          className="side-tab sidebar-feedback"
          style={{ marginBottom: 4 }}
        >
          <span aria-hidden="true" className="sidebar-feedback-dot" />
          Feedback
        </a>
        <Link to="/legal" className="side-tab" style={{ marginBottom: 4 }}>
          Legal
        </Link>
        <div className="sidebar-user muted" title={user?.email}>{user?.email}</div>
        <button className="btn btn-ghost btn-block" type="button" onClick={() => logout()}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
