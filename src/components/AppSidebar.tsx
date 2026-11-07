import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "./Wordmark";
import { FeedbackModal } from "./FeedbackModal";
import { NavIcon } from "./NavIcon";
import { NotificationBell } from "./NotificationBell";
import { readSidebarCollapsed, writeSidebarCollapsed, readNavGroupCollapsed, writeNavGroupCollapsed } from "../lib/sidebarState";

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
  // v151 (Part E1): the stored choice for this group wins over the default;
  // toggling stores the new one. Groups the user never touched start from
  // defaultCollapsed, exactly as before.
  const [collapsed, setCollapsed] = useState<boolean>(() => readNavGroupCollapsed(label) ?? defaultCollapsed);

  useEffect(() => {
    if (forceExpanded) setCollapsed(false);
  }, [forceExpanded]);

  function toggle() {
    setCollapsed((c) => {
      writeNavGroupCollapsed(label, !c);
      return !c;
    });
  }

  return (
    <div className={collapsed ? "side-nav-group collapsed" : "side-nav-group"}>
      <div
        className="side-nav-label collapsible"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
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
export function AppSidebar({ children, menuLabel = "Menu" }: { children?: ReactNode; menuLabel?: string }) {
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
        <div className="sidebar-bar-actions">
          <NotificationBell />
          <button
            type="button"
            ref={menuButtonRef}
            className="sidebar-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="sidebar-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "Close" : menuLabel}
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
      </div>

      <nav className="side-nav" id="sidebar-nav" aria-label="Main">
        {/* v151 (Part E1): Workspace starts expanded everywhere, project
            pages included -- the old defaultCollapsed={!!children} hid the
            global nav behind an unmarked header on exactly the pages where
            people need it to escape the project. A stored user choice
            still wins (see NavGroup). */}
        <NavGroup label="Workspace">
          <Link to="/app" className={pathname === "/app" ? "side-tab active" : "side-tab"}>
            <NavIcon name="today" active={pathname === "/app"} />
            Today
          </Link>
          <Link to="/app/projects" className={pathname === "/app/projects" ? "side-tab active" : "side-tab"}>
            <NavIcon name="dashboard" active={pathname === "/app/projects"} />
            Projects
          </Link>
          <Link to="/app/sync" className={pathname === "/app/sync" ? "side-tab active" : "side-tab"}>
            <NavIcon name="decisions" active={pathname === "/app/sync"} />
            Weekly sync
          </Link>
          <Link to="/app/workload" className={pathname === "/app/workload" ? "side-tab active" : "side-tab"}>
            <NavIcon name="team" active={pathname === "/app/workload"} />
            Workload
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
            to="/app/activity"
            className={pathname === "/app/activity" ? "side-tab active" : "side-tab"}
          >
            <NavIcon name="report" active={pathname === "/app/activity"} />
            My activity
          </Link>
        </NavGroup>

        {children}

        {user?.isAdmin && (
          <NavGroup label="Admin" defaultCollapsed={!!children}>
            <Link
              to="/admin/waitlist"
              className={pathname === "/admin/waitlist" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="waitlist" active={pathname === "/admin/waitlist"} />
              Waitlist
            </Link>
            <Link
              to="/admin/feedback"
              className={pathname === "/admin/feedback" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="feedback" active={pathname === "/admin/feedback"} />
              Feedback inbox
            </Link>
            <Link
              to="/admin/founding-members"
              className={pathname === "/admin/founding-members" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="founding" active={pathname === "/admin/founding-members"} />
              Founding members
            </Link>
            <Link
              to="/admin/founder-hub"
              className={pathname === "/admin/founder-hub" ? "side-tab active" : "side-tab"}
            >
              <NavIcon name="founding" active={pathname === "/admin/founder-hub"} />
              Founder hub
            </Link>
          </NavGroup>
        )}
      </nav>

      <div className="sidebar-footer">
        <Link
          to="/app/account"
          className={pathname === "/app/account" ? "side-tab active" : "side-tab"}
          style={{ marginBottom: 4 }}
        >
          <NavIcon name="account" active={pathname === "/app/account"} />
          Account
        </Link>
        {user?.plan === "founding" && (
          <Link
            to="/app/founding"
            className={pathname === "/app/founding" ? "side-tab active" : "side-tab"}
            style={{ marginBottom: 4 }}
          >
            <NavIcon name="founding" active={pathname === "/app/founding"} />
            Founder hub
          </Link>
        )}
        {/* Founding members have Pro for free: nothing to bill, so no Billing entry. */}
        {user?.plan !== "founding" && (
          <Link
            to="/app/billing"
            className={pathname === "/app/billing" ? "side-tab active" : "side-tab"}
            style={{ marginBottom: 4 }}
          >
            <NavIcon name="billing" active={pathname === "/app/billing"} />
            Billing
          </Link>
        )}
        <button
          type="button"
          className="side-tab sidebar-feedback"
          style={{ marginBottom: 4 }}
          onClick={() => setFeedbackOpen(true)}
        >
          <NavIcon name="feedback" active={false} />
          Feedback
        </button>
        <a
          href="https://discord.gg/R66gSFz9d"
          target="_blank"
          rel="noopener noreferrer"
          className="side-tab"
          style={{ marginBottom: 4 }}
        >
          <NavIcon name="community" active={false} />
          Community
        </a>
        <Link to="/legal" className="side-tab" style={{ marginBottom: 4 }}>
          <NavIcon name="legal" active={false} />
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
