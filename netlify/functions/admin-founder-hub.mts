import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { getStrictAdmin } from "../lib/adminGate.ts";
import { mrrContributionUsd } from "../lib/billingPrices.ts";

// Founder Hub (v152): one admin-only, read-only page's data — milestones,
// revenue, users & activation, feature usage, and friction, all computed
// at request time from what the app already stores (users, subscriptions,
// projects, tasks, status_updates, decision_requests, activity_log,
// feedback). There is no write path in this file at all: GET only, every
// other method is a 405, and no query below mutates data. No migration,
// no stored rollups.
//
// Shared definitions (V152_SPEC.md; defined once, used by every panel):
//   GA user — not a founding member, not the beta test account, and not
//     the admin's own account (Flag D3, adopted at approval). The beta
//     account is identifiable only by its email — there is no is_test
//     flag on users; the email literal below is the same one the
//     20261102000000_remove_beta_founding_member migration uses. The
//     admin is excluded by id (getStrictAdmin has already matched
//     ADMIN_EMAIL for us).
//   GA payer — a GA user whose subscriptions row (one per user, kept
//     current by stripe-webhook.mts) is 'active', 'trialing', or
//     'past_due'. Past_due is still a paying relationship inside its
//     grace period; the spec's own Panel 2 assertions count it as a
//     payer and include it in MRR. Milestone rung 1 is stricter —
//     active only (Flag D1): a trial can never trip it.
//   MRR — derived from the plan mix via lib/billingPrices.ts, because
//     the mirror stores no amounts. Trialing contributes $0.

const BETA_EMAIL = "beta@tasketra.com";
const DAY_MS = 24 * 60 * 60 * 1000;

type UserSubRow = {
  id: string;
  email: string;
  founding_member: boolean;
  created_at: string;
  email_verified_at: string | null;
  last_pulse_sent_at: string | null;
  sub_status: string | null;
  sub_interval: string | null;
  sub_trial_end: string | null;
  sub_updated_at: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Usage Panel mapping: app section -> activity_log entity types
// (src/lib/projectNav.ts labels; V152_SPEC.md Panel 4).
const USAGE_SECTIONS: { section: string; entityTypes: string[] }[] = [
  { section: "Overview (check-ins / feed)", entityTypes: ["status_update"] },
  { section: "Tasks", entityTypes: ["task"] },
  { section: "Roadmap", entityTypes: ["roadmap_item"] },
  { section: "Meetings", entityTypes: ["meeting"] },
  { section: "OKRs", entityTypes: ["objective", "key_result"] },
  { section: "Issues", entityTypes: ["issue"] },
  { section: "Risks", entityTypes: ["risk"] },
  { section: "Assumptions", entityTypes: ["assumption"] },
  { section: "Dependencies", entityTypes: ["dependency"] },
  { section: "Quality", entityTypes: ["quality_item"] },
  { section: "Compliance", entityTypes: ["compliance_item"] },
  { section: "Decisions", entityTypes: ["decision"] },
  { section: "Stakeholders", entityTypes: ["stakeholder"] },
  { section: "Team", entityTypes: ["member"] },
  { section: "Vendors", entityTypes: ["procurement_item"] },
  { section: "Comms plan", entityTypes: ["comm_plan_item"] },
  { section: "Documents", entityTypes: ["document"] },
  { section: "Closure (lessons)", entityTypes: ["lesson"] },
  { section: "Project scaffolding", entityTypes: ["project", "change_request"] },
];

// Sections no function ever writes an activity_log row for. They can never
// show usage in Panel 4; the page marks them with an asterisk so a zero is
// never misread as "nobody uses this".
const UNLOGGED_SECTIONS = ["Budget", "Charter", "RACI", "Weekly report", "Templates", "Export", "Connections", "Trash"];

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const database = db();
  const admin = await getStrictAdmin(database, userId);
  if (!admin) return json({ error: "Not authorized" }, { status: 403 });

  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const rows = (await database.sql`
    SELECT u.id, u.email, u.founding_member, u.created_at, u.email_verified_at, u.last_pulse_sent_at,
           s.status AS sub_status, s.billing_interval AS sub_interval, s.trial_end AS sub_trial_end,
           s.updated_at AS sub_updated_at
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at ASC
  `) as unknown as UserSubRow[];

  const isGa = (r: UserSubRow) =>
    !r.founding_member && r.email.toLowerCase() !== BETA_EMAIL && r.id !== admin.id;
  const gaRows = rows.filter(isGa);
  const isPayerStatus = (s: string | null) => s === "active" || s === "trialing" || s === "past_due";

  // --- Panel 3 cohorts (over ALL accounts; buckets sum to total) --------
  const cohorts = { freeForever: 0, inTrial: 0, payingMonthly: 0, payingYearly: 0, freeRegular: 0 };
  for (const r of rows) {
    if (r.founding_member) cohorts.freeForever += 1;
    else if (r.sub_status === "trialing") cohorts.inTrial += 1;
    else if (r.sub_status === "active" || r.sub_status === "past_due") {
      if (r.sub_interval === "year") cohorts.payingYearly += 1;
      else cohorts.payingMonthly += 1;
    } else cohorts.freeRegular += 1;
  }

  // --- Panel 2 revenue (GA only, from the local mirror) ------------------
  const gaSubs = gaRows.filter((r) => r.sub_status !== null);
  const gaActive = gaSubs.filter((r) => r.sub_status === "active");
  const gaTrialing = gaSubs.filter((r) => r.sub_status === "trialing");
  const gaPastDue = gaSubs.filter((r) => r.sub_status === "past_due");
  const gaPayers = gaSubs.filter((r) => isPayerStatus(r.sub_status));
  const gaMrr = round2(gaSubs.reduce((sum, r) => sum + mrrContributionUsd(r.sub_status, r.sub_interval), 0));
  const pastDueMrr = round2(gaPastDue.reduce((sum, r) => sum + mrrContributionUsd(r.sub_status, r.sub_interval), 0));
  const byPlan = {
    payingMonthly: gaActive.filter((r) => r.sub_interval !== "year").length,
    payingYearly: gaActive.filter((r) => r.sub_interval === "year").length,
    trialingMonthly: gaTrialing.filter((r) => r.sub_interval !== "year").length,
    trialingYearly: gaTrialing.filter((r) => r.sub_interval === "year").length,
  };
  const trialEnds = gaTrialing
    .map((r) => r.sub_trial_end)
    .filter((d): d is string => !!d)
    .sort()
    .slice(0, 5);
  const foundingSubs = rows.filter((r) => r.founding_member && r.sub_status !== null);
  const foundingSubscribers = {
    active: foundingSubs.filter((r) => r.sub_status === "active").length,
    trialing: foundingSubs.filter((r) => r.sub_status === "trialing").length,
    pastDue: foundingSubs.filter((r) => r.sub_status === "past_due").length,
    mrr: round2(foundingSubs.reduce((sum, r) => sum + mrrContributionUsd(r.sub_status, r.sub_interval), 0)),
  };

  // --- Panel 1 milestone ladder (computed, never stored) -----------------
  const gaActiveYearly = gaActive.filter((r) => r.sub_interval === "year").length;
  type Rung = {
    id: string; label: string;
    state: "achieved" | "not_measurable" | "pending";
    current: number | null; target: number | null;
  };
  const rungs: Rung[] = [
    { id: "first-ga-paying", label: "First GA paying customer", state: gaActive.length >= 1 ? "achieved" : "pending", current: gaActive.length, target: 1 },
    { id: "first-annual-payer", label: "First annual-plan payer", state: gaActiveYearly >= 1 ? "achieved" : "pending", current: gaActiveYearly, target: 1 },
    { id: "ten-ga-payers", label: "10 GA payers", state: gaPayers.length >= 10 ? "achieved" : "pending", current: gaPayers.length, target: 10 },
    { id: "mrr-1k", label: "$1K MRR", state: gaMrr >= 1000 ? "achieved" : "pending", current: gaMrr, target: 1000 },
    { id: "fifty-ga-payers", label: "50 GA payers", state: gaPayers.length >= 50 ? "achieved" : "pending", current: gaPayers.length, target: 50 },
    { id: "mrr-5k", label: "$5K MRR", state: gaMrr >= 5000 ? "achieved" : "pending", current: gaMrr, target: 5000 },
    // Flag D2: churn cannot be reconstructed from current-state-only
    // subscription rows, so this rung ships honestly unmeasurable.
    { id: "churn-under-5", label: "Monthly churn under 5%", state: "not_measurable", current: null, target: 5 },
  ];
  const nextRung = rungs.find((r) => r.state === "pending") ?? null;
  const milestones = {
    rungs,
    nextMilestone: nextRung ? { id: nextRung.id, label: nextRung.label, current: nextRung.current, target: nextRung.target } : null,
  };

  // --- Panel 3 signups per week (trailing 12 weeks, zeros filled) --------
  const weekStartOf = (d: Date) => {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
    day.setUTCDate(day.getUTCDate() - dow);
    return day;
  };
  const currentWeek = weekStartOf(new Date(now));
  const signupsPerWeek: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(currentWeek.getTime() - i * 7 * DAY_MS);
    const end = start.getTime() + 7 * DAY_MS;
    signupsPerWeek.push({
      week: start.toISOString().slice(0, 10),
      count: rows.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= start.getTime() && t < end;
      }).length,
    });
  }

  // --- Panel 3 activation funnel (GA users, as project owners) -----------
  const [funnelRow] = await database.sql`
    SELECT
      count(*)::int AS signed_up,
      count(*) FILTER (WHERE u.email_verified_at IS NOT NULL)::int AS verified,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM projects p WHERE p.owner_id = u.id AND p.deleted_at IS NULL))::int AS created_project,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM projects p JOIN tasks t ON t.project_id = p.id WHERE p.owner_id = u.id AND p.deleted_at IS NULL AND t.deleted_at IS NULL))::int AS added_task,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM projects p JOIN status_updates su ON su.project_id = p.id WHERE p.owner_id = u.id AND p.deleted_at IS NULL))::int AS posted_checkin,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM projects p JOIN decision_requests dr ON dr.project_id = p.id WHERE p.owner_id = u.id AND p.deleted_at IS NULL AND dr.deleted_at IS NULL))::int AS created_decision
    FROM users u
    WHERE u.founding_member = false AND lower(u.email) <> ${BETA_EMAIL} AND u.id <> ${admin.id}
  `;
  const funnelSteps = [
    { key: "signed_up", label: "Signed up", count: funnelRow.signed_up },
    { key: "verified", label: "Verified email", count: funnelRow.verified },
    { key: "created_project", label: "Created a project", count: funnelRow.created_project },
    { key: "added_task", label: "Added a task", count: funnelRow.added_task },
    { key: "posted_checkin", label: "Posted a check-in", count: funnelRow.posted_checkin },
    { key: "created_decision", label: "Created a decision request", count: funnelRow.created_decision },
  ].map((step, i, all) => ({
    ...step,
    pctFromPrevious: i === 0 || all[i - 1].count === 0 ? null : Math.round((step.count / all[i - 1].count) * 1000) / 10,
  }));

  // --- Panel 4 feature usage (activity_log, trailing 30 days) ------------
  const usageRows = (await database.sql`
    SELECT entity_type,
           count(*) FILTER (WHERE created_at >= ${since30d})::int AS actions_30d,
           count(*)::int AS actions_all_time,
           count(DISTINCT project_id) FILTER (WHERE created_at >= ${since30d})::int AS distinct_projects,
           count(DISTINCT actor_id) FILTER (WHERE created_at >= ${since30d})::int AS distinct_users
    FROM activity_log
    GROUP BY entity_type
  `) as unknown as { entity_type: string; actions_30d: number; actions_all_time: number; distinct_projects: number; distinct_users: number }[];
  const byEntity = new Map(usageRows.map((r) => [r.entity_type, r]));
  const sections = USAGE_SECTIONS.map(({ section, entityTypes }) => {
    const parts = entityTypes.map((t) => byEntity.get(t)).filter((r) => !!r);
    return {
      section,
      entityTypes,
      actions30d: parts.reduce((s, r) => s + r.actions_30d, 0),
      actionsAllTime: parts.reduce((s, r) => s + r.actions_all_time, 0),
      // Distinct counts are summed across a section's entity types — an
      // upper bound when a project/user touched two types in one section
      // (only OKRs and scaffolding have two). Fine at this scale; noted
      // in V152_FIXES.md.
      distinctProjects: parts.reduce((s, r) => s + r.distinct_projects, 0),
      distinctUsers: parts.reduce((s, r) => s + r.distinct_users, 0),
    };
  }).sort((a, b) => b.actions30d - a.actions30d);
  const rarelyUsed = [
    ...sections.filter((s) => s.actions30d === 0).map((s) => s.section),
    ...UNLOGGED_SECTIONS.map((s) => `${s}*`),
  ];
  const depthRows = (await database.sql`
    SELECT count(*)::int AS actions, count(DISTINCT entity_type)::int AS types
    FROM activity_log
    WHERE created_at >= ${since30d}
    GROUP BY project_id
  `) as unknown as { actions: number; types: number }[];
  const usage = {
    sections,
    rarelyUsed,
    unloggedSections: UNLOGGED_SECTIONS,
    depth: {
      medianActionsPerProject: median(depthRows.map((r) => r.actions)),
      medianSectionsPerProject: median(depthRows.map((r) => r.types)),
      activeProjects30d: depthRows.length,
    },
  };

  // --- Panel 5 friction ---------------------------------------------------
  const [feedbackRow] = await database.sql`
    SELECT
      count(*) FILTER (WHERE status = 'new')::int AS new_count,
      count(*) FILTER (WHERE status = 'planned')::int AS planned_count,
      count(*) FILTER (WHERE status = 'shipped')::int AS shipped_count,
      count(*) FILTER (WHERE status = 'dismissed')::int AS dismissed_count,
      count(*) FILTER (WHERE status = 'new' AND created_at >= now() - interval '7 days')::int AS new_7d,
      count(*) FILTER (WHERE status = 'new' AND created_at >= now() - interval '30 days')::int AS new_30d,
      min(created_at) FILTER (WHERE status = 'new') AS oldest_new_at
    FROM feedback
  `;
  const oldestNewAt = feedbackRow.oldest_new_at ? String(feedbackRow.oldest_new_at) : null;
  const friction = {
    feedback: {
      byStatus: { new: feedbackRow.new_count, planned: feedbackRow.planned_count, shipped: feedbackRow.shipped_count, dismissed: feedbackRow.dismissed_count },
      newLast7d: feedbackRow.new_7d,
      newLast30d: feedbackRow.new_30d,
      oldestNewAt,
      oldestNewAgeDays: oldestNewAt ? Math.floor((now - new Date(oldestNewAt).getTime()) / DAY_MS) : null,
    },
    pulseSent30d: rows.filter((r) => r.last_pulse_sent_at && new Date(r.last_pulse_sent_at).getTime() >= now - 30 * DAY_MS).length,
    cancellations30d: gaSubs.filter(
      (r) => r.sub_status === "canceled" && r.sub_updated_at && new Date(r.sub_updated_at).getTime() >= now - 30 * DAY_MS
    ).length,
  };

  return json({
    milestones,
    revenue: {
      gaMrr,
      gaPayers: gaPayers.length,
      gaPayersActive: gaActive.length,
      gaPayersTrialing: gaTrialing.length,
      payersByPlan: byPlan,
      trials: { count: gaTrialing.length, trialEnds },
      pastDue: { count: gaPastDue.length, mrrAtRisk: pastDueMrr },
      foundingSubscribers,
    },
    users: {
      total: rows.length,
      cohorts,
      gaPayers: gaPayers.length,
      signupsPerWeek,
      funnel: funnelSteps,
    },
    usage,
    friction,
  });
});

export const config: Config = { path: "/api/admin-founder-hub" };
