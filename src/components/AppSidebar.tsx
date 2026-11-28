import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { avatarColor, initials } from "../lib/avatar";
import { Wordmark } from "./Wordmark";
import { FeedbackModal } from "./FeedbackModal";
import { NavIcon } from "./NavIcon";
import { NotificationBell } from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import { PhoneBottomBar } from "./PhoneBottomBar";
import { readSidebarCollapsed, writeSidebarCollapsed, readNavGroupCollapsed, writeNavGroupCollapsed } from "../lib/sidebarState";

/** Phone-width media query, the QuickAddJump useMatch pattern: the Menu
 * sheet's modal behaviour (R3-pre) attaches only while the sheet is the
 * phone sheet, never to the desktop rail. */
const PHONE_QUERY = "(max-width: 860px)";
function usePhoneWidth(): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PHONE_QUERY).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return matches;
}

/** Collapsible nav section used by both the sidebar's own groups and
 * ProjectHome's project groups -- clicking the label toggles a chevron
 * and shows/hides the items below it. On phones the items always render
 * regardless of collapsed state (see the CSS media query in v174: nav
 * groups never sit collapsed in the phone Menu sheet). */
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
 * The single persistent navigation system (v174, navigation consolidation).
 * One left rail carries everything: the primary destinations, the Portfolio
 * group (the cross-project Decisions and Risks & Issues views that used to
 * live only in the retired AppTabs top bar), the project block ProjectHome
 * passes as children, Help, and the footer. On phones the rail's body
 * becomes the Menu sheet behind the bottom bar's Menu button, with groups
 * always expanded and the account items listed flat.
 */
export function AppSidebar({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // v159 (F-19): the footer account rows became a compact user menu.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tourBusy, setTourBusy] = useState(false);
  const [helpNotice, setHelpNotice] = useState<string | null>(null);
  // Phone-width menu sheet. On desktop the sidebar is always open and this
  // does nothing; below 860px the navigation sits in a sheet the bottom
  // bar's Menu button opens (PhoneBottomBar).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // R3-pre: the sheet is a modal dialog only while it is open at phone
  // width. On desktop the same .sidebar-body element is the rail
  // (display:contents) and none of this attaches.
  const phoneWidth = usePhoneWidth();
  const sheetActive = menuOpen && phoneWidth;
  // Desktop only: tuck the sidebar down to a strip of icons. Remembered per browser.
  const [collapsed, setCollapsed] = useState<boolean>(() => readSidebarCollapsed());
  const asideRef = useRef<HTMLElement>(null);
  // The Portfolio Decisions badge: open decision requests across the
  // member's projects, from the same rollup the Dashboard uses.
  const [decisionsWaiting, setDecisionsWaiting] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .getPortfolio()
      .then((d) => { if (live) setDecisionsWaiting(d.openDecisions?.length ?? 0); })
      .catch(() => { /* badge just stays as it was */ });
    return () => { live = false; };
  }, [pathname]);

  // Going somewhere closes the menus.
  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); }, [pathname, search]);

  // The Help group's Tour entry: the same replay the Resource hub offers --
  // the tour walks through a real project, so it opens the first one.
  async function replayTour() {
    setTourBusy(true);
    setHelpNotice(null);
    try {
      const { projects } = await api.listProjects();
      if (projects.length === 0) {
        setHelpNotice("Create a project first, the tour walks through a real one.");
        return;
      }
      navigate(`/app/projects/${projects[0].id}`, { state: { startTour: true, forceReplay: true } });
    } catch {
      setHelpNotice("Couldn't load your projects. Try again from the Resource hub.");
    } finally {
      setTourBusy(false);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // R3-pre: while the Menu sheet is open at phone width it behaves as the
  // modal dialog it now declares itself to be -- the union of the Create
  // sheet's pattern (PhoneBottomBar) and Modal.tsx's: the page behind is
  // scroll-locked (with Modal's scrollbar compensation), focus moves into
  // the sheet on open, Tab cycles inside it, and focus returns to the
  // Menu button on close when it was inside the sheet. Escape stays with
  // the effect above, exactly as it already behaved.
  useEffect(() => {
    if (!sheetActive) return;
    const sheet = sheetRef.current;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const barWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (barWidth > 0) body.style.paddingRight = `${barWidth}px`;

    const focusables = () =>
      sheet
        ? Array.from(
            sheet.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.closest("[hidden]"))
        : [];
    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !sheet?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !sheet?.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      if (sheet?.contains(document.activeElement)) menuButtonRef.current?.focus();
    };
  }, [sheetActive]);

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

  const tabCls = (active: boolean) => (active ? "side-tab active" : "side-tab");

  return (
    <>
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
          <Wordmark size="sm" beta mark />
        </Link>
        <div className="sidebar-bar-actions">
          <NotificationBell />
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

      <GlobalSearch />

      {/* R3-pre: while the sheet is open at phone width, a backdrop sits
          behind it (above the page, below the sheet) and a tap on it
          closes the sheet. It never renders on desktop. */}
      {sheetActive && (
        <div
          className="menu-sheet-backdrop"
          aria-hidden="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}
        />
      )}

      {/* On phones this wrapper is the Menu sheet (fixed, above the bottom
          bar); on desktop it is display:contents and the rail lays out as
          before. While open at phone width it is presented as a modal
          dialog (R3-pre); the dialog attributes attach only in that
          state, so the desktop rail keeps its plain landmark structure. */}
      <div
        className="sidebar-body"
        ref={sheetRef}
        role={sheetActive ? "dialog" : undefined}
        aria-modal={sheetActive ? true : undefined}
        aria-label={sheetActive ? "Menu" : undefined}
      >
      <nav className="side-nav" id="sidebar-nav" aria-label="Main">
        <Link to="/app/projects?new=1" className="sidebar-new-project" title="New project">
          <span aria-hidden="true" className="sidebar-new-plus">+</span>
          <span className="sidebar-new-label">New project</span>
        </Link>

        {/* The primary list: ungrouped since v174 (the "Workspace" label
            named the container, not a job, and earned nothing). */}
        <div className="side-nav-group">
          <div className="side-nav-items">
            <Link to="/app" className={tabCls(pathname === "/app")}>
              <NavIcon name="today" active={pathname === "/app"} />
              Today
            </Link>
            <Link to="/app/projects" className={tabCls(pathname === "/app/projects")}>
              <NavIcon name="dashboard" active={pathname === "/app/projects"} />
              Projects
            </Link>
            <Link to="/app/sync" className={tabCls(pathname === "/app/sync")}>
              <NavIcon name="decisions" active={pathname === "/app/sync"} />
              Weekly Sync
            </Link>
            <Link to="/app/workload" className={tabCls(pathname === "/app/workload")}>
              <NavIcon name="team" active={pathname === "/app/workload"} />
              Workload
            </Link>
          </div>
        </div>

        {/* The cross-project views, moved here from the retired tab bar so
            they live in the same system as everything else. */}
        <NavGroup label="Portfolio">
          <Link to="/app/decisions" className={tabCls(pathname === "/app/decisions")}>
            <NavIcon name="decisions" active={pathname === "/app/decisions"} />
            Decisions
            {decisionsWaiting > 0 && (
              <span className="side-badge" aria-label={`${decisionsWaiting} waiting`}>
                {decisionsWaiting}
              </span>
            )}
          </Link>
          <Link to="/app/risks" className={tabCls(pathname === "/app/risks")}>
            <NavIcon name="risks" active={pathname === "/app/risks"} />
            Risks &amp; Issues
          </Link>
        </NavGroup>

        {children}

        {user?.isAdmin && (
          <NavGroup label="Admin" defaultCollapsed={!!children}>
            <Link
              to="/admin/waitlist"
              className={tabCls(pathname === "/admin/waitlist")}
            >
              <NavIcon name="waitlist" active={pathname === "/admin/waitlist"} />
              Waitlist
            </Link>
            <Link
              to="/admin/feedback"
              className={tabCls(pathname === "/admin/feedback")}
            >
              <NavIcon name="feedback" active={pathname === "/admin/feedback"} />
              Feedback inbox
            </Link>
            <Link
              to="/admin/founding-members"
              className={tabCls(pathname === "/admin/founding-members")}
            >
              <NavIcon name="founding" active={pathname === "/admin/founding-members"} />
              Founding members
            </Link>
            <Link
              to="/admin/founder-hub"
              className={tabCls(pathname === "/admin/founder-hub")}
            >
              <NavIcon name="founding" active={pathname === "/admin/founder-hub"} />
              Founder console
            </Link>
            <Link
              to="/admin/email-founding-members"
              className={tabCls(pathname === "/admin/email-founding-members")}
            >
              <NavIcon name="email" active={pathname === "/admin/email-founding-members"} />
              Email members
            </Link>
          </NavGroup>
        )}

        {/* v174: Help carries the single Learn entry (the old "Guides"
            duplicate is gone, so the double active state is impossible),
            the tour and feedback. */}
        <NavGroup label="Help">
          <Link to="/app/resources" className={tabCls(pathname === "/app/resources")}>
            <NavIcon name="resources" active={pathname === "/app/resources"} />
            Learn
          </Link>
          <button type="button" className="side-tab sidebar-help-item" disabled={tourBusy} onClick={() => void replayTour()}>
            <NavIcon name="tour" active={false} />
            {tourBusy ? "Loading..." : "Tour"}
          </button>
          <button type="button" className="side-tab sidebar-help-item" onClick={() => setFeedbackOpen(true)}>
            <NavIcon name="feedback" active={false} />
            Feedback
          </button>
          {helpNotice && <p className="sidebar-help-note">{helpNotice}</p>}
        </NavGroup>
      </nav>

      <div className="sidebar-footer">
        <Link
          to="/app/whats-new"
          className={tabCls(pathname === "/app/whats-new")}
          style={{ marginBottom: 4 }}
        >
          <NavIcon name="whatsnew" active={pathname === "/app/whats-new"} />
          What&apos;s new
        </Link>
        <Link
          to="/app/activity"
          className={tabCls(pathname === "/app/activity")}
          style={{ marginBottom: 4 }}
        >
          <NavIcon name="report" active={pathname === "/app/activity"} />
          My activity
        </Link>
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
        {/* Phones only (CSS): the account items listed flat in the Menu
            sheet, so Account and Billing are two taps from anywhere
            instead of three through the nested user menu. */}
        <div className="phone-account-links">
          <Link
            to="/app/account"
            className={tabCls(pathname === "/app/account")}
            style={{ marginBottom: 4 }}
          >
            <NavIcon name="account" active={pathname === "/app/account"} />
            Account
          </Link>
          {user?.plan === "founding" && (
            <Link
              to="/app/founding"
              className={tabCls(pathname === "/app/founding")}
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
              className={tabCls(pathname === "/app/billing")}
              style={{ marginBottom: 4 }}
            >
              <NavIcon name="billing" active={pathname === "/app/billing"} />
              Billing
            </Link>
          )}
          <button type="button" className="side-tab user-menu-signout" onClick={() => logout()}>
            <NavIcon name="signout" active={false} />
            Sign out
          </button>
        </div>
        {/* v159 (F-19): one compact user menu -- initials, Account, Billing,
            Sign out -- instead of a stack of plain account rows. The panel
            stays in the DOM while closed (hidden) so the entries are always
            reachable by keyboard and assistive tech through the button.
            Desktop pattern; phones use the flat list above. */}
        <div className="user-menu">
          <div className="user-menu-panel" hidden={!userMenuOpen}>
            <Link
              to="/app/account"
              className={tabCls(pathname === "/app/account")}
              style={{ marginBottom: 4 }}
              onClick={() => setUserMenuOpen(false)}
            >
              <NavIcon name="account" active={pathname === "/app/account"} />
              Account
            </Link>
            {user?.plan === "founding" && (
              <Link
                to="/app/founding"
                className={tabCls(pathname === "/app/founding")}
                style={{ marginBottom: 4 }}
                onClick={() => setUserMenuOpen(false)}
              >
                <NavIcon name="founding" active={pathname === "/app/founding"} />
                Founder hub
              </Link>
            )}
            {/* Founding members have Pro for free: nothing to bill, so no Billing entry. */}
            {user?.plan !== "founding" && (
              <Link
                to="/app/billing"
                className={tabCls(pathname === "/app/billing")}
                style={{ marginBottom: 4 }}
                onClick={() => setUserMenuOpen(false)}
              >
                <NavIcon name="billing" active={pathname === "/app/billing"} />
                Billing
              </Link>
            )}
            <button type="button" className="side-tab user-menu-signout" onClick={() => logout()}>
              <NavIcon name="signout" active={false} />
              Sign out
            </button>
          </div>
          <button
            type="button"
            className="user-menu-btn"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((o) => !o)}
          >
            {user?.has_avatar ? (
              <img src={api.avatarUrl(user.id)} alt="" width={28} height={28} className="user-menu-avatar" />
            ) : (
              <span className="member-avatar user-menu-avatar-initials" style={{ background: avatarColor(user?.email ?? "") }} aria-hidden="true">
                {initials(user?.display_name || user?.email || "")}
              </span>
            )}
            <span className="user-menu-name" title={user?.email}>{user?.display_name || user?.email}</span>
            <span className="user-menu-chev" aria-hidden="true">▾</span>
          </button>
        </div>
      </div>
      </div>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </aside>
    {/* v174: the portfolio top tabs (AppTabs) are retired; on phones the
        bottom bar takes their place as the persistent chrome, and its
        Menu button opens the sidebar body above as a sheet. */}
    <PhoneBottomBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((o) => !o)} menuButtonRef={menuButtonRef} />
    </>
  );
}
