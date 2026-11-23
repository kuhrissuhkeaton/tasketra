// Global search palette plumbing (v159, F-18): turns the grouped
// /api/search payload into the flat, keyboard-navigable list the palette
// renders. Pure so the grouping, ordering and link targets are testable
// without a DOM. Group order is fixed (projects, tasks, decisions, risks)
// and matches the order the groups render in.

import type { SearchResults } from "./api";
import { NAV_GROUPS } from "./projectNav";

export type SearchItem = {
  /** Stable key for React and for aria-activedescendant. */
  key: string;
  group: "Pages & features" | "Projects" | "Tasks" | "Decisions" | "Risks";
  title: string;
  /** The project the item lives in; for a project hit, the project itself.
   *  For a page/feature hit, a short where-it-lives line instead. */
  projectName: string;
  href: string;
};

export function flattenSearchResults(results: SearchResults): SearchItem[] {
  const items: SearchItem[] = [];
  for (const p of results.projects) {
    items.push({ key: `project-${p.id}`, group: "Projects", title: p.name, projectName: p.name, href: `/app/projects/${p.id}` });
  }
  for (const t of results.tasks) {
    items.push({ key: `task-${t.id}`, group: "Tasks", title: t.title, projectName: t.projectName, href: `/app/projects/${t.projectId}?tab=tasks` });
  }
  for (const d of results.decisions) {
    items.push({ key: `decision-${d.id}`, group: "Decisions", title: d.title, projectName: d.projectName, href: `/app/projects/${d.projectId}?tab=decisions` });
  }
  for (const r of results.risks) {
    items.push({ key: `risk-${r.id}`, group: "Risks", title: r.title, projectName: r.projectName, href: `/app/projects/${r.projectId}?tab=risks` });
  }
  return items;
}

/* --- Pages & features index (v174) -------------------------------------
 * Until v174 the palette indexed content only, so the product's own
 * features were unfindable: "snapshot", "webhooks" and "connect your AI"
 * returned nothing, and a member once had to email the founder to ask
 * whether a capability existed. This static index knows the pages and
 * features themselves. Matching is a plain substring test against the
 * title and its aliases; the aliases deliberately include the OLD labels
 * for one release cycle (R7 in the consolidation proposal), so a member
 * hunting for "Comms Plan" or "Weekly Report" still lands in the right
 * place after the rename. */

export type FeatureContext = {
  /** The project whose page the palette was opened on, if any. */
  projectId?: string | null;
  /** The signed-in plan; founding members never see Billing (Brooks #6). */
  plan?: string | null;
};

type FeatureDef = {
  title: string;
  aliases: string[];
  href: (ctx: FeatureContext) => string;
  subtitle: string | ((ctx: FeatureContext) => string);
  visible?: (ctx: FeatureContext) => boolean;
};

const inProject = (ctx: FeatureContext) => (ctx.projectId ? "This project" : "Pick a project first");

const GLOBAL_FEATURES: FeatureDef[] = [
  { title: "Today", aliases: ["home", "start here", "my day"], href: () => "/app", subtitle: "Page" },
  { title: "Projects", aliases: ["dashboard", "project list", "all projects"], href: () => "/app/projects", subtitle: "Page" },
  { title: "New project", aliases: ["create project", "start a project", "add project"], href: () => "/app/projects?new=1", subtitle: "Page" },
  { title: "Weekly Sync", aliases: ["sync", "weekly"], href: () => "/app/sync", subtitle: "Page" },
  { title: "Workload", aliases: ["capacity", "team load", "who is busy"], href: () => "/app/workload", subtitle: "Page" },
  { title: "Decisions", aliases: ["waiting decisions", "approvals", "decision requests"], href: () => "/app/decisions", subtitle: "All projects" },
  { title: "Risks & Issues", aliases: ["risks", "issues", "risk register"], href: () => "/app/risks", subtitle: "All projects" },
  { title: "Learn", aliases: ["guides", "help", "how to", "project templates", "articles"], href: () => "/app/resources", subtitle: "Page" },
  { title: "What's new", aliases: ["changelog", "updates", "new features", "release notes"], href: () => "/app/whats-new", subtitle: "Page" },
  { title: "My activity", aliases: ["history", "recent activity", "audit"], href: () => "/app/activity", subtitle: "Page" },
  {
    title: "Account",
    aliases: ["profile", "my settings", "password", "connect your ai", "mcp", "api tokens", "tokens", "referral"],
    href: () => "/app/account",
    subtitle: "Page",
  },
  {
    title: "Billing",
    aliases: ["upgrade", "pro", "trial", "start trial", "subscription", "plan", "payment"],
    href: () => "/app/billing",
    subtitle: "Page",
    visible: (ctx) => ctx.plan !== "founding",
  },
  {
    title: "Founder hub",
    aliases: ["founding", "founding members"],
    href: () => "/app/founding",
    subtitle: "Page",
    visible: (ctx) => ctx.plan === "founding",
  },
  {
    title: "Client Snapshot",
    aliases: ["snapshot", "sponsor", "share project", "client view"],
    href: (ctx) => (ctx.projectId ? `/app/projects/${ctx.projectId}/print/snapshot` : "/app/projects"),
    subtitle: inProject,
  },
  {
    title: "Webhooks",
    aliases: ["webhook", "connections", "integrations", "zapier"],
    href: (ctx) => (ctx.projectId ? `/app/projects/${ctx.projectId}?tab=connections` : "/app/projects"),
    subtitle: inProject,
  },
];

/** Old and alternate names for project sections, keyed by tab id. */
const SECTION_ALIASES: Record<string, string[]> = {
  okrs: ["okrs", "objectives", "key results"],
  raci: ["raci"],
  comms: ["comms plan", "comms", "communications"],
  report: ["weekly report"],
  templates: ["templates"],
  connections: ["connections", "integrations", "zapier"],
  team: ["settings", "team", "members", "danger zone"],
  procurement: ["procurement", "purchases"],
  trash: ["deleted", "restore", "deleted items"],
  charter: ["purpose", "sponsor"],
  snapshot: ["snapshot", "sponsor view"],
};

const MAX_FEATURE_RESULTS = 8;

function matches(query: string, title: string, aliases: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;
  if (title.toLowerCase().includes(q)) return true;
  return aliases.some((a) => a.includes(q));
}

/** The page/feature hits for a query, in a stable order: global pages
 *  first, then the current project's sections in nav order. */
export function featureMatches(query: string, ctx: FeatureContext): SearchItem[] {
  const out: SearchItem[] = [];
  const push = (title: string, href: string, subtitle: string) => {
    out.push({ key: `feature-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${href}`, group: "Pages & features", title, projectName: subtitle, href });
  };
  for (const f of GLOBAL_FEATURES) {
    if (out.length >= MAX_FEATURE_RESULTS) break;
    if (f.visible && !f.visible(ctx)) continue;
    if (!matches(query, f.title, f.aliases)) continue;
    push(f.title, f.href(ctx), typeof f.subtitle === "function" ? f.subtitle(ctx) : f.subtitle);
  }
  if (ctx.projectId) {
    for (const g of NAV_GROUPS) {
      if (out.length >= MAX_FEATURE_RESULTS) break;
      for (const s of g.sections) {
        if (out.length >= MAX_FEATURE_RESULTS) break;
        if (s.id === "home") continue;
        if (!matches(query, s.label, SECTION_ALIASES[s.id] ?? [])) continue;
        // The global Client Snapshot / Webhooks entries already cover these.
        if (s.id === "snapshot" || s.id === "connections") continue;
        push(s.label, s.href ? s.href(ctx.projectId) : `/app/projects/${ctx.projectId}?tab=${s.id}`, "This project");
      }
    }
  }
  return out;
}

/** The next active index for arrow-key movement, wrapping at both ends. */
export function moveSearchIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
