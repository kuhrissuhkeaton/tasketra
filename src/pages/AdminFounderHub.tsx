import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FounderHubData } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { PageHeader, SoftCard } from "../components/ui";
import { fmtDate } from "../lib/format";
import { PRO_MONTHLY_USD, PRO_ANNUAL_USD } from "../lib/pricing";
import { useDocumentTitle } from "../lib/documentTitle";

// Founder Hub (v152): the admin-only monitoring page. Everything here is
// an aggregate computed by /api/admin-founder-hub from data the app
// already stores; Sentry and Plausible are link-outs because neither has
// a read API wired into the app. Numbers are stated plainly, including
// the ones that are zero and the one (churn) that cannot be measured yet.

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

const statGrid: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 24, margin: "8px 0" };

export default function AdminFounderHub() {
  useDocumentTitle("Founder hub");
  const [data, setData] = useState<FounderHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.adminGetFounderHub()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the founder hub."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="project-shell">
      <AppSidebar />

      <main id="main-content" className="project-main">
        <PageHeader title="Founder hub" subtitle="Milestones, money, activation, usage, and friction, from the app's own data." />

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : data ? (
          <div style={{ display: "grid", gap: 16, maxWidth: 860 }}>
            <SoftCard title="Milestones">
              {data.milestones.nextMilestone ? (
                <p>
                  <strong>Next milestone:</strong> {data.milestones.nextMilestone.label} — {data.milestones.nextMilestone.current} of {data.milestones.nextMilestone.target}
                </p>
              ) : (
                <p><strong>Every measurable milestone is achieved.</strong></p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {data.milestones.rungs.map((rung) => (
                  <li key={rung.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>{rung.state === "achieved" ? "✓ " : ""}{rung.label}</span>
                    {rung.state === "achieved" ? (
                      <span className="pill pill-green">Achieved</span>
                    ) : rung.state === "not_measurable" ? (
                      <span className="muted">Not measurable yet</span>
                    ) : (
                      <span className="muted">{rung.current} of {rung.target}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Monthly churn is not measurable yet: subscription records hold only the current state, with no
                history to divide by, so this rung shows no percentage rather than a made-up one. Cancellations
                in the last 30 days are counted under Friction below.
              </p>
            </SoftCard>

            <SoftCard title="Revenue">
              <div style={statGrid}>
                <Stat label="MRR (from plan mix)" value={money(data.revenue.gaMrr)} />
                <Stat label="GA payers" value={data.revenue.gaPayers} />
                <Stat label="Paying monthly" value={data.revenue.payersByPlan.payingMonthly} />
                <Stat label="Paying yearly" value={data.revenue.payersByPlan.payingYearly} />
                <Stat label="In trial, monthly" value={data.revenue.payersByPlan.trialingMonthly} />
                <Stat label="In trial, yearly" value={data.revenue.payersByPlan.trialingYearly} />
              </div>
              <p>
                Trials running: {data.revenue.trials.count}
                {data.revenue.trials.trialEnds.length > 0 && (
                  <> · soonest ends {data.revenue.trials.trialEnds.map((d) => fmtDate(d)).join(", ")}</>
                )}
              </p>
              <p>
                Past due: {data.revenue.pastDue.count} · {money(data.revenue.pastDue.mrrAtRisk)} of MRR at risk
              </p>
              <p className="muted">
                Founding subscribers (kept separate from GA): {data.revenue.foundingSubscribers.active} active,{" "}
                {data.revenue.foundingSubscribers.trialing} in trial, {data.revenue.foundingSubscribers.pastDue} past due ·{" "}
                {money(data.revenue.foundingSubscribers.mrr)} MRR. MRR is derived from the plan mix (${PRO_MONTHLY_USD} monthly,
                ${PRO_ANNUAL_USD} yearly) in the app's own subscription records, not a live Stripe read.{" "}
                <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Reconcile in Stripe</a>
              </p>
            </SoftCard>

            <SoftCard title="Users and activation">
              <div style={statGrid}>
                <Stat label="Total users" value={data.users.total} />
                <Stat label="Free forever (beta/founding)" value={data.users.cohorts.freeForever} />
                <Stat label="In trial" value={data.users.cohorts.inTrial} />
                <Stat label="Paying monthly" value={data.users.cohorts.payingMonthly} />
                <Stat label="Paying yearly" value={data.users.cohorts.payingYearly} />
                <Stat label="Free" value={data.users.cohorts.freeRegular} />
              </div>
              <p className="muted">Every account is in exactly one group above, and the groups add up to the total.</p>

              <h3>Activation (GA users)</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {data.users.funnel.map((step) => (
                  <li key={step.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>{step.label}</span>
                    <span className="muted">
                      {step.count}{step.pctFromPrevious !== null ? ` · ${step.pctFromPrevious}% of the step before` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Verified email reads close to 100% for older accounts: when email verification was added, every
                existing account was marked verified at that moment, so this step is only meaningful for signups
                after that change. Check-ins and decision requests are counted through the projects a person
                owns, because those records do not name who posted them, so team activity counts toward the
                project owner.
              </p>

              <h3>Signups per week</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                {data.users.signupsPerWeek.map((w) => (
                  <li key={w.week} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span className="muted">Week of {fmtDate(w.week)}</span>
                    <span>{w.count}</span>
                  </li>
                ))}
              </ul>
            </SoftCard>

            <SoftCard title="Feature usage (last 30 days)">
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {data.usage.sections.map((s) => (
                  <li key={s.section} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span>{s.section}</span>
                    <span className="muted">
                      {s.actions30d} actions · {s.actionsAllTime} all time · {s.distinctProjects} projects · {s.distinctUsers} people
                    </span>
                  </li>
                ))}
              </ul>
              {data.usage.rarelyUsed.length > 0 && (
                <p>No activity in 30 days: {data.usage.rarelyUsed.join(", ")}</p>
              )}
              <p className="muted">
                This measures doing, not reading: viewing a page or downloading a document leaves no record, so a
                section can be read daily and still show zero here. Sections marked * never write an activity
                record at all, so they will always read zero until they are instrumented. Project depth: a median
                of {data.usage.depth.medianActionsPerProject ?? 0} actions per active project, across a median of{" "}
                {data.usage.depth.medianSectionsPerProject ?? 0} kinds of activity ({data.usage.depth.activeProjects30d} active projects).
              </p>
            </SoftCard>

            <SoftCard title="Friction">
              <div style={statGrid}>
                <Stat label="Feedback: new" value={data.friction.feedback.byStatus.new} />
                <Stat label="Feedback: planned" value={data.friction.feedback.byStatus.planned} />
                <Stat label="Feedback: shipped" value={data.friction.feedback.byStatus.shipped} />
                <Stat label="Feedback: dismissed" value={data.friction.feedback.byStatus.dismissed} />
                <Stat label="New feedback (7 days)" value={data.friction.feedback.newLast7d} />
                <Stat label="New feedback (30 days)" value={data.friction.feedback.newLast30d} />
                <Stat label="Cancellations (30 days)" value={data.friction.cancellations30d} />
                <Stat label="Pulse emails sent (30 days)" value={data.friction.pulseSent30d} />
              </div>
              {data.friction.feedback.oldestNewAt && (
                <p className="muted">
                  Oldest new feedback has been waiting {data.friction.feedback.oldestNewAgeDays} days (since {fmtDate(data.friction.feedback.oldestNewAt)}).
                </p>
              )}
              <p>
                <Link className="btn btn-ghost" to="/admin/feedback">Open the feedback inbox</Link>
              </p>
              <p className="muted">
                Pulse emails sent (30d): {data.friction.pulseSent30d} — replies go to your inbox and aren't tracked here.
                Cancellations are a count, not a churn rate (see Milestones). Errors and traffic live outside the
                app: <a href="https://sentry.io" target="_blank" rel="noreferrer">Sentry</a> ·{" "}
                <a href="https://plausible.io" target="_blank" rel="noreferrer">Traffic and pre-signup funnel in Plausible</a>
              </p>
            </SoftCard>
          </div>
        ) : null}
      </main>
    </div>
  );
}
