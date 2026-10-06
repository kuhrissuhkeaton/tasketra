import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "./Wordmark";
import { FeedbackModal } from "./FeedbackModal";
import { NavIcon } from "./NavIcon";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../lib/sidebarState";

/** Collapsible nav section used by both the sidebar's own global group and
 * ProjectHome's secondary (non-pill-bar) groups -- clicking the label
 * toggles a chevron and shows/hides the items below it. On mobile the
 * items always render regardless of collapsed state (see the CSS media
 * query), since the label/chevron affordance is hidden there. */
export function NavGroup({
  label,
  children,
  defaultCollapsed = false,
  forceExpanded = false,
}: {
  label: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  /** Overrides the collapsed state open, e.g. so the product tour can reveal
   * a sidebar group whose contents it's about to spotlight. Doesn't fight
   * the user's own toggle -- it only ever forces open, never closed. */
  forceExpanded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (forceExpanded) setCollapsed(false);
  }, [forceExpanded]);

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
  const { pathname, search } = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Phone-width menu. On desktop the sidebar is always open and this does nothing;
  // below 860px the navigation sits behind a Menu button instead of a strip you
  // had to know to scroll sideways.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Desktop only: tuck the sidebar down to a strip of icons. Remembered per browser.
  const [collapsed, setCollapsed] = useState<boolean>(() => readSidebarCollapsed());
  const asideRef = useRef<HTMLElement>(null);

  // Going somewhere closes the menu.
  useEffect(() => { setMenuOpen(false); }, [pathname, search]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  // In the icon rail the text is hidden, so give each item a tooltip from its own
  // label. Only titles added here are removed again on expand.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const apply = () => {
      el.querySelectorAll<HTMLElement>(".side-nav .side-tab").forEach((tab) => {
        if (collapsed) {
          const label = (tab.textContent || "").trim();
          if (label && !tab.hasAttribute("title")) {
            tab.setAttribute("title", label);
            tab.setAttribute("data-rail-title", "1");
          }
        } else if (tab.hasAttribute("data-rail-title")) {
          tab.removeAttribute("title");
          tab.removeAttribute("data-rail-title");
        }
      });
    };
    apply();
    if (!collapsed) return;
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [collapsed, pathname]);

  const sidebarClass = ["sidebar", menuOpen && "sidebar-open", collapsed && "sidebar-collapsed"]
    .filter(Boolean)
    .join(" ");

  return (
    <aside ref={asideRef} className={sidebarClass}>
      {/* Keyboard shortcut past the navigation: visible only when focused. */}
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          const main = document.querySelector("main");
          if (!main) return;
          e.preventDefault();
          main.setAttribute("tabindex", "-1");
          main.focus();
          main.scrollIntoView?.({ block: "start" });
        }}
      >
        Skip to main content
      </a>
      <div className="sidebar-bar">
        <Link to="/app" className="sidebar-wordmark">
          <Wordmark size="sm" beta />
        </Link>
        <button
          type="button"
          ref={menuButtonRef}
          className="sidebar-menu-btn"
          aria-expanded={menuOpen}
          aria-controls="sidebar-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
        <button
          type="button"
          className="sidebar-collapse-btn"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          onClick={toggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? "\u00bb" : "\u00ab"}</span>
        </button>
      </div>

      <nav className="side-nav" id="sidebar-nav" aria-label="Main">
        <NavGroup label="Workspace" defaultCollapsed={!!children}>
          <Link to="/app" className={pathname === "/app" ? "side-tab active" : "side-tab"}>
            <NavIcon name="dashboard" active={pathname === "/app"} />
            Dashboard
          </Link>
          <Link
            to="/app/resources"
            className={pathname === "/app/resources" ? "side-tab active" : "side-tab"}
          >
            <NavIcon name="resources" active={pathname === "/app/resources"} />
            Resource hub
          </Link>
          <Link
            to="/app/whats-new"
            className={pathname === "/app/whats-new" ? "side-tab active" : "side-tab"}
          >
            <NavIcon name="whatsnew" active={pathname === "/app/whats-new"} />
            What's new
          </Link>
          <Link
            to="/app/account"
            className={pathname === "/app/account" ? "side-tab active" : "side-tab"}
          >
            <NavIcon name="account" active={pathname === "/app/account"} />
            Account
          </Link>
          {/* Founding members have Pro for free: nothing to bill, so no Billing entry. */}
          {user?.plan !== "founding" && (
            <Link
              to="/app/billing"
              className={pathname === "/app/billing" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="billing" active={pathname === "/app/billing"} />
              Billing
            </Link>
          )}
          {user?.isAdmin && (
            <Link
              to="/admin/waitlist"
              className={pathname === "/admin/waitlist" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="waitlist" active={pathname === "/admin/waitlist"} />
              Waitlist
            </Link>
          )}
          {user?.isAdmin && (
            <Link
              to="/admin/feedback"
              className={pathname === "/admin/feedback" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="feedback" active={pathname === "/admin/feedback"} />
              Feedback inbox
            </Link>
          )}
          {user?.isAdmin && (
            <Link
              to="/admin/founding-members"
              className={pathname === "/admin/founding-members" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="founding" active={pathname === "/admin/founding-members"} />
              Founding members
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
