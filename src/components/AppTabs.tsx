import { Link, useLocation } from "react-router-dom";

// The portfolio top tabs (v164, Portfolio Command): the cross-project
// views as a tab bar across the top of every signed-in page -- Dashboard
// (the visual portfolio home), Today, Projects, and the two NEW
// cross-project views, Decisions and Risks & Issues, alongside Weekly
// Sync and Workload. Rendered by AppSidebar next to the sidebar, which
// keeps everything it already carried (logo, Cmd-K search, Help,
// Settings/Account, the user avatar menu) -- the plan's slim rail maps
// onto that sidebar rather than replacing it, so no existing route,
// deep link or tested sidebar behavior moves. The Dashboard tab and the
// Projects tab point at the same page in its two views, the split the
// page's own List/Dashboard toggle has always made.
const TABS: { label: string; to: string; isActive: (pathname: string, view: string | null) => boolean }[] = [
  {
    label: "Dashboard",
    to: "/app/projects?view=dashboard",
    isActive: (p, view) => p === "/app/dashboard" || (p === "/app/projects" && view === "dashboard"),
  },
  { label: "Today", to: "/app", isActive: (p) => p === "/app" },
  {
    label: "Projects",
    to: "/app/projects",
    isActive: (p, view) => (p === "/app/projects" && view !== "dashboard") || p.startsWith("/app/projects/"),
  },
  { label: "Decisions", to: "/app/decisions", isActive: (p) => p === "/app/decisions" },
  { label: "Risks & Issues", to: "/app/risks", isActive: (p) => p === "/app/risks" },
  { label: "Weekly Sync", to: "/app/sync", isActive: (p) => p === "/app/sync" },
  { label: "Workload", to: "/app/workload", isActive: (p) => p === "/app/workload" },
];

export function AppTabs() {
  const { pathname, search } = useLocation();
  const view = new URLSearchParams(search).get("view");
  return (
    <nav className="app-tabs" aria-label="Portfolio views">
      {/* v164.1: the tabs live in their own scrollable strip and the
          + New project link sits outside it. As one long row (v164) the
          button was the last item in the scrolling area, so on any
          window narrower than the full row it slid off the right edge
          with the scrollbar hidden and no way to see it was there. Now
          the strip scrolls under the button, which never moves. */}
      <div className="app-tabs-scroll">
        {TABS.map((t) => {
          const active = t.isActive(pathname, view);
          return (
            <Link
              key={t.label}
              to={t.to}
              className={active ? "app-tab app-tab-active" : "app-tab"}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Link className="app-tabs-new" to="/app/projects?new=1">+ New project</Link>
    </nav>
  );
}
