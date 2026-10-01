// The Resource hub's "How a project runs in Tasketra" guide: for each stage,
// what to do and which tab to do it in. Pure data (no imports) so it is easy
// to keep in step with the app. A unit test checks that every tab named here
// still exists in ProjectHome.tsx, so renaming a tab without updating this
// guide fails the build instead of quietly misleading people.
//
// Written to read both ways: the one-line goal and the step titles are enough
// for an experienced PM; the "why" under each step is for someone newer.

export type GuideStep = {
  /** What to do, imperative. */
  title: string;
  /** The tab, as it is labelled in the project's navigation. */
  tab: string;
  /** One sentence on why it matters or how the app helps. */
  why: string;
  /** Hidden on Light projects unless "Show all tabs" is on. Shown as a small note. */
  lightHides?: boolean;
};

export type GuideStage = {
  id: "initiate" | "plan" | "execute" | "close";
  name: string;
  goal: string;
  steps: GuideStep[];
  /** What the Next up checklist on the project's Home tab asks for in this stage. */
  checklist: string;
};

export const GUIDE_STAGES: GuideStage[] = [
  {
    id: "initiate",
    name: "Initiate",
    goal: "Agree why the project exists and who it is for, before anyone builds anything.",
    steps: [
      { title: "Write the charter", tab: "Charter", why: "Purpose, scope, success measures and sponsor in one place. The sponsor can approve it from a link, no login needed." },
      { title: "List the first tasks", tab: "Tasks", why: "A rough list is enough at this point. You will shape it in Plan." },
      { title: "Add your stakeholders", tab: "Stakeholders", why: "Record each person's role, interest level, how they like to be contacted and notes, with one-click email and call links." },
      { title: "Note the early risks", tab: "Risks", why: "Probability and impact give each risk a score, and the Matrix view shows where the worst ones sit." },
    ],
    checklist: "Charter written, first tasks, stakeholders, early risks.",
  },
  {
    id: "plan",
    name: "Plan",
    goal: "Turn the idea into a schedule, a budget and a baseline you can measure against.",
    steps: [
      { title: "Lay out phases and milestones", tab: "Roadmap", why: "Phases, milestones and releases on a timeline, grouped by swimlane. Share a read-only link with people outside the project." },
      { title: "Build the work breakdown and give tasks dates", tab: "Tasks", why: "Sub-tasks make a work breakdown. Pick a phase on each task and the Roadmap shows how full each phase is." },
      { title: "Set the budget baseline", tab: "Budget", why: "Needed to compare cost against plan later. Add a contingency reserve if you hold one.", lightHides: true },
      { title: "Lock the baseline", tab: "Roadmap", why: "A snapshot of every task's dates and the budget once the plan is agreed, so you can see what moves afterwards. Only the owner can lock it, and nothing is blocked." },
      { title: "Plan how you will talk, buy and check quality", tab: "Comms plan", why: "Comms plan, Vendors, Quality and Compliance are there when the project is big or regulated enough to need them.", lightHides: true },
    ],
    checklist: "Work breakdown, schedule dates, stakeholders, budget baseline, risks, baseline locked.",
  },
  {
    id: "execute",
    name: "Execute",
    goal: "Do the work and keep a weekly pulse on whether it is on track.",
    steps: [
      { title: "Work the plan and keep tasks current", tab: "Tasks", why: "List, board and Gantt views of the same tasks. Blocked and overdue tasks surface on Home." },
      { title: "Handle changes properly", tab: "Decisions", why: "Change requests record the reason and the schedule and budget impact, with change board approval if you use one. Decisions can also be sent to stakeholders by link." },
      { title: "Re-score risks and clear issues", tab: "Issues", why: "A risk that has happened becomes an issue in one click. Risks not reviewed in 30 days are flagged on Home." },
      { title: "Compare cost to the baseline", tab: "Budget", why: "Earned value metrics (CPI, SPI, EAC) work out whether you are over or under.", lightHides: true },
      { title: "Send the weekly status report", tab: "Weekly report", why: "Built from your live data, ready to print or save as PDF. Lessons learned are captured in the same tab as you go." },
    ],
    checklist: "Change requests decided, risks re-scored, budget compared to baseline, weekly status shared.",
  },
  {
    id: "close",
    name: "Close",
    goal: "Finish cleanly, so the next project starts smarter.",
    steps: [
      { title: "Work through the closure checklist", tab: "Closure", why: "Five items: final lessons, open items resolved, budget reconciled, stakeholder sign-off, documents archived. Nothing here blocks you from closing." },
      { title: "Resolve or accept open issues and risks", tab: "Issues", why: "Anything left open is listed so closing it is a choice, not an oversight." },
      { title: "Capture lessons learned", tab: "Weekly report", why: "What went well, what did not and one action for next time. Switch to the Lessons view." },
      { title: "Archive the paperwork", tab: "Documents", why: "Keep contracts, sign-offs and final reports together, and export what you need." },
    ],
    checklist: "Closure checklist, open issues, open risks.",
  },
];

export const GUIDE_PRINCIPLE =
  "Nothing blocks you. Stages, baselines, thresholds and approvals prompt or flag; they never stop you moving on. Size only hides tabs, never data, and one switch under Team shows everything.";

/** Every tab name the guide points to, for the drift test. */
export function guideTabNames(): string[] {
  const names = new Set<string>();
  for (const s of GUIDE_STAGES) for (const step of s.steps) names.add(step.tab);
  return [...names];
}
