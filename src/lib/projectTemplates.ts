// Project templates: a starting skeleton for a new project, by type. Each one
// is a set of phases (laid out back to back on the roadmap, linked to their
// own tasks), a couple of milestones, starter tasks, the risks that usually
// bite that kind of project, placeholder stakeholder roles and assumptions.
//
// Pure data with no imports, so the Resource Hub (to show what is inside),
// the New project form (to describe it) and the server (to apply it) all
// read the same single source. Every date is a day offset from the moment
// the project is created, never a fixed calendar date.
//
// Deliberately plain: titles say what to do, nothing is pre-marked done, and
// stakeholders are roles ("Executive sponsor") not made-up people, so the
// user replaces them rather than deleting fake names.

export type TemplateId = "process-improvement" | "event-campaign" | "software-launch" | "construction";

type Level = "low" | "medium" | "high";

export type TemplatePhase = { title: string; days: number };
/** `phase` is an index into `phases`; `day` is the due date as days after the project starts. */
export type TemplateTask = { title: string; phase: number; day: number };
export type TemplateMilestone = { title: string; day: number; type?: "milestone" | "release" };
export type TemplateRisk = { title: string; description: string; probability: Level; impact: Level; mitigation: string };
export type TemplateStakeholder = { name: string; role: string; power: Level; interest: Level; notes: string };

export type ProjectTemplate = {
  id: TemplateId;
  name: string;
  blurb: string;
  bestFor: string;
  suggestedApproach: "predictive" | "hybrid" | "agile";
  phases: TemplatePhase[];
  milestones: TemplateMilestone[];
  tasks: TemplateTask[];
  risks: TemplateRisk[];
  stakeholders: TemplateStakeholder[];
  assumptions: string[];
};

const PLACEHOLDER = "Placeholder role. Replace the name with the real person, or delete it.";

const processImprovement: ProjectTemplate = {
  id: "process-improvement",
  name: "Process improvement / rollout",
  blurb: "Fix or change how work gets done: understand today's process, design a better one, prove it small, then roll it out and make it stick.",
  bestFor: "Changing a workflow, adopting a new tool or policy, reducing errors, delays or cost.",
  suggestedApproach: "hybrid",
  phases: [
    { title: "Assess", days: 14 },
    { title: "Design", days: 21 },
    { title: "Pilot", days: 28 },
    { title: "Roll out", days: 28 },
    { title: "Sustain", days: 21 },
  ],
  milestones: [
    { title: "Future-state design approved", day: 35 },
    { title: "Go / no-go on rollout", day: 63 },
  ],
  tasks: [
    { title: "Map the current process end to end", phase: 0, day: 7 },
    { title: "Collect baseline numbers (time, errors, cost)", phase: 0, day: 10 },
    { title: "Interview the people who do the work", phase: 0, day: 12 },
    { title: "Agree the problem statement and how success is measured", phase: 0, day: 14 },
    { title: "Find root causes and quick wins", phase: 1, day: 20 },
    { title: "Design the future-state process", phase: 1, day: 28 },
    { title: "Get the future-state design approved", phase: 1, day: 35 },
    { title: "Choose the pilot team and set pilot success criteria", phase: 2, day: 38 },
    { title: "Train the pilot group", phase: 2, day: 45 },
    { title: "Run the pilot and track the same numbers as the baseline", phase: 2, day: 60 },
    { title: "Hold a pilot retrospective and decide go / no-go", phase: 2, day: 63 },
    { title: "Build the communication and training plan", phase: 3, day: 66 },
    { title: "Roll out in waves", phase: 3, day: 84 },
    { title: "Be on hand to help during the first weeks", phase: 3, day: 90 },
    { title: "Set up ongoing reporting on the key numbers", phase: 4, day: 100 },
    { title: "Hand over to the process owner", phase: 4, day: 105 },
    { title: "Close out and capture lessons learned", phase: 4, day: 110 },
  ],
  risks: [
    { title: "Staff resist the new way of working", description: "People who were not part of the design may see the change as extra work or a criticism.", probability: "high", impact: "high", mitigation: "Involve front-line staff in the design, name champions on each team, and explain the why before the how." },
    { title: "Baseline data is incomplete or unreliable", description: "Without a trusted starting point, you cannot show the change worked.", probability: "medium", impact: "high", mitigation: "Agree the data source early and sample by hand for two weeks if the systems cannot provide it." },
    { title: "The pilot group is not representative", description: "A friendly or unusually small team can make results look better than they will be at scale.", probability: "medium", impact: "medium", mitigation: "Pick a pilot that includes a typical mix of work and at least one skeptical team." },
    { title: "No named process owner, so the gains fade", description: "Once the project team leaves, nobody keeps the new process alive.", probability: "medium", impact: "high", mitigation: "Name the owner during Design and have them sign off the design." },
    { title: "Rollout collides with a busy period", description: "Training and change land when people have the least time for them.", probability: "low", impact: "medium", mitigation: "Check the business calendar before fixing rollout dates." },
  ],
  stakeholders: [
    { name: "Executive sponsor", role: "Sponsor", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Process owner", role: "Owns the process after the project ends", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Front-line representative", role: "Does the work today", power: "low", interest: "high", notes: PLACEHOLDER },
    { name: "Finance partner", role: "Validates cost and savings", power: "medium", interest: "medium", notes: PLACEHOLDER },
    { name: "Systems / IT contact", role: "Tools and data", power: "medium", interest: "medium", notes: PLACEHOLDER },
  ],
  assumptions: [
    "Front-line staff can be released for interviews and training",
    "Baseline numbers can be pulled from existing systems or sampled by hand",
  ],
};

const eventCampaign: ProjectTemplate = {
  id: "event-campaign",
  name: "Event / marketing campaign",
  blurb: "A fixed date that cannot move: plan the goal and budget, prepare, promote, run it, then measure and learn.",
  bestFor: "Conferences, webinars, product launches, fundraisers, marketing campaigns.",
  suggestedApproach: "predictive",
  phases: [
    { title: "Plan", days: 14 },
    { title: "Prepare", days: 28 },
    { title: "Promote", days: 28 },
    { title: "Run", days: 7 },
    { title: "Wrap-up", days: 14 },
  ],
  milestones: [
    { title: "Budget and date locked", day: 14 },
    { title: "Event / campaign goes live", day: 70, type: "release" },
  ],
  tasks: [
    { title: "Define the goal, audience and how success is measured", phase: 0, day: 5 },
    { title: "Set the budget and get it approved", phase: 0, day: 10 },
    { title: "Lock the date and the venue or channels", phase: 0, day: 14 },
    { title: "Book vendors and sign contracts", phase: 1, day: 25 },
    { title: "Write the creative brief and key messages", phase: 1, day: 28 },
    { title: "Build the registration or landing page", phase: 1, day: 35 },
    { title: "Draft the run-of-show or campaign calendar", phase: 1, day: 42 },
    { title: "Send the first announcement", phase: 2, day: 45 },
    { title: "Send reminders and follow-ups", phase: 2, day: 58 },
    { title: "Confirm final numbers with vendors", phase: 2, day: 66 },
    { title: "Do a full walk-through or test run", phase: 2, day: 69 },
    { title: "Run the event or launch the campaign", phase: 3, day: 70 },
    { title: "Check in daily and fix problems on the spot", phase: 3, day: 77 },
    { title: "Send thank-yous and collect feedback", phase: 4, day: 80 },
    { title: "Reconcile the budget and pay invoices", phase: 4, day: 88 },
    { title: "Report results against the goal and capture lessons learned", phase: 4, day: 91 },
  ],
  risks: [
    { title: "Costs run over once vendor quotes arrive", description: "Early estimates are often low and quotes land after the budget is approved.", probability: "medium", impact: "high", mitigation: "Get quotes before locking the budget, hold a contingency of 10 to 15 percent." },
    { title: "Creative or message approvals take longer than planned", description: "Reviews bounce between several approvers and eat the promotion window.", probability: "high", impact: "medium", mitigation: "Name one final approver and set review deadlines in the plan." },
    { title: "Low turnout or weak response", description: "The audience does not engage as hoped.", probability: "medium", impact: "high", mitigation: "Check registrations weekly against a target and add a push early, not at the end." },
    { title: "A key vendor or venue falls through", description: "A cancellation or missed delivery close to the date.", probability: "low", impact: "high", mitigation: "Contracts in writing, and a named backup for the riskiest supplier." },
    { title: "Technical or logistics failure on the day", description: "Audio, streaming, access or timing breaks live.", probability: "low", impact: "medium", mitigation: "Run a full test beforehand and keep a one-page problem plan for the day." },
  ],
  stakeholders: [
    { name: "Executive sponsor", role: "Holds the budget", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Event or campaign lead", role: "Day-to-day owner", power: "medium", interest: "high", notes: PLACEHOLDER },
    { name: "Key vendor or venue contact", role: "Delivers the main supplier work", power: "medium", interest: "medium", notes: PLACEHOLDER },
    { name: "Brand or communications approver", role: "Signs off messages and creative", power: "high", interest: "medium", notes: PLACEHOLDER },
    { name: "Sales or customer-facing team", role: "Follows up with attendees and leads", power: "low", interest: "medium", notes: PLACEHOLDER },
  ],
  assumptions: [
    "The budget is approved before any vendor is contracted",
    "The target audience can be reached through channels we already have",
  ],
};

const softwareLaunch: ProjectTemplate = {
  id: "software-launch",
  name: "Software / product launch",
  blurb: "Agree what you are building and why, build it in steps, test it properly, release with a rollback plan, then learn from real users.",
  bestFor: "A new product or feature, an internal system, an app release.",
  suggestedApproach: "agile",
  phases: [
    { title: "Discovery", days: 14 },
    { title: "Build", days: 42 },
    { title: "Test", days: 21 },
    { title: "Release", days: 7 },
    { title: "Post-launch", days: 14 },
  ],
  milestones: [
    { title: "Scope signed off", day: 14 },
    { title: "Go / no-go decision", day: 77 },
    { title: "Launch day", day: 80, type: "release" },
  ],
  tasks: [
    { title: "Interview users and stakeholders", phase: 0, day: 7 },
    { title: "Write requirements and rank the must-haves", phase: 0, day: 12 },
    { title: "Agree scope and success metrics", phase: 0, day: 14 },
    { title: "Break scope into stories or work packages", phase: 1, day: 18 },
    { title: "Set up environments and the delivery pipeline", phase: 1, day: 24 },
    { title: "Build the first working slice end to end", phase: 1, day: 35 },
    { title: "Demo progress to stakeholders and adjust", phase: 1, day: 45 },
    { title: "Finish the build", phase: 1, day: 56 },
    { title: "Prepare the test plan and test data", phase: 2, day: 58 },
    { title: "Run QA and fix defects", phase: 2, day: 70 },
    { title: "Run user acceptance testing", phase: 2, day: 75 },
    { title: "Complete security and performance checks", phase: 2, day: 76 },
    { title: "Write the release plan and rollback plan", phase: 3, day: 78 },
    { title: "Train support and customer-facing teams", phase: 3, day: 79 },
    { title: "Go live", phase: 3, day: 80 },
    { title: "Monitor and fix early issues", phase: 4, day: 84 },
    { title: "Gather user feedback", phase: 4, day: 90 },
    { title: "Review results against the success metrics and capture lessons learned", phase: 4, day: 98 },
  ],
  risks: [
    { title: "Scope grows after sign-off", description: "New requests arrive during the build and quietly push the date.", probability: "high", impact: "high", mitigation: "Log every request as a change, decide trade-offs openly with the sponsor." },
    { title: "Not enough time left to test", description: "The build overruns and testing is squeezed.", probability: "high", impact: "medium", mitigation: "Test as you build, and agree up front what gets cut if time runs short." },
    { title: "A third-party service or integration is late", description: "An outside dependency is not ready when the build needs it.", probability: "medium", impact: "high", mitigation: "Confirm dates in writing and build against a stand-in until it is ready." },
    { title: "Users do not adopt the new product", description: "It ships, but people keep using the old way.", probability: "medium", impact: "high", mitigation: "Involve real users in discovery and UAT, and plan training and a communication push." },
    { title: "A key person becomes unavailable", description: "One person holds knowledge nobody else has.", probability: "low", impact: "high", mitigation: "Pair on critical areas and keep decisions written down." },
  ],
  stakeholders: [
    { name: "Executive sponsor", role: "Funds and backs the launch", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Product owner", role: "Decides what is built and in what order", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Tech lead", role: "Owns how it is built", power: "medium", interest: "high", notes: PLACEHOLDER },
    { name: "User representative", role: "Speaks for the people who will use it", power: "low", interest: "medium", notes: PLACEHOLDER },
    { name: "Support or operations lead", role: "Runs it after launch", power: "medium", interest: "medium", notes: PLACEHOLDER },
  ],
  assumptions: [
    "The team keeps its planned capacity through the build",
    "Third-party services will be ready to integrate when the build needs them",
  ],
};

const construction: ProjectTemplate = {
  id: "construction",
  name: "Construction / facilities",
  blurb: "Physical work with permits and contractors: settle the design and cost, get approvals, build, inspect, hand over and close out.",
  bestFor: "New builds, renovations, office moves, facilities upgrades.",
  suggestedApproach: "predictive",
  phases: [
    { title: "Design", days: 28 },
    { title: "Permits & procurement", days: 28 },
    { title: "Construction", days: 56 },
    { title: "Inspection & handover", days: 21 },
    { title: "Closeout", days: 14 },
  ],
  milestones: [
    { title: "Design approved", day: 28 },
    { title: "Permits issued", day: 56 },
    { title: "Substantial completion", day: 112 },
  ],
  tasks: [
    { title: "Define scope, budget and requirements with the owner", phase: 0, day: 7 },
    { title: "Select the architect or designer", phase: 0, day: 14 },
    { title: "Complete the design drawings", phase: 0, day: 24 },
    { title: "Get owner sign-off on the design and cost estimate", phase: 0, day: 28 },
    { title: "Submit permit applications", phase: 1, day: 32 },
    { title: "Tender the work or collect contractor quotes", phase: 1, day: 42 },
    { title: "Award contracts and agree the schedule", phase: 1, day: 49 },
    { title: "Order long-lead materials", phase: 1, day: 52 },
    { title: "Confirm permits are issued and conditions understood", phase: 1, day: 56 },
    { title: "Hold the pre-construction meeting", phase: 2, day: 60 },
    { title: "Mobilise the site with the safety plan in place", phase: 2, day: 63 },
    { title: "Review progress, cost and change orders at weekly site meetings", phase: 2, day: 70 },
    { title: "Complete main works", phase: 2, day: 90 },
    { title: "Complete finishes and fit-out", phase: 2, day: 105 },
    { title: "Book inspections", phase: 3, day: 115 },
    { title: "Walk the site and write the punch list", phase: 3, day: 122 },
    { title: "Fix punch list items", phase: 3, day: 130 },
    { title: "Pass final inspection and get sign-off to occupy", phase: 3, day: 133 },
    { title: "Collect warranties, manuals and as-built drawings", phase: 4, day: 140 },
    { title: "Make final payment and close contracts", phase: 4, day: 145 },
    { title: "Capture lessons learned", phase: 4, day: 147 },
  ],
  risks: [
    { title: "Permit approval takes longer than planned", description: "Reviewers ask for revisions or the queue is longer than published.", probability: "high", impact: "high", mitigation: "Meet the authority before submitting, submit complete packages and track the review weekly." },
    { title: "Costs rise through change orders or material prices", description: "Scope shifts after contracts are signed and prices move.", probability: "high", impact: "medium", mitigation: "Freeze the design before tender, hold a contingency, and approve every change order in writing." },
    { title: "Long-lead items arrive late", description: "Specialised materials or equipment hold up the whole schedule.", probability: "medium", impact: "high", mitigation: "Order early, and ask suppliers for confirmed delivery dates." },
    { title: "Weather or site conditions delay the work", description: "Rain, cold or unexpected ground conditions stop work.", probability: "medium", impact: "medium", mitigation: "Build float into outdoor work and run a site survey before design is finalised." },
    { title: "A safety incident on site", description: "An injury stops work and may trigger an investigation.", probability: "low", impact: "high", mitigation: "Site safety plan, daily briefings and a contractor with a good record." },
  ],
  stakeholders: [
    { name: "Owner / executive sponsor", role: "Funds the project and signs off", power: "high", interest: "high", notes: PLACEHOLDER },
    { name: "Architect or designer", role: "Design and drawings", power: "medium", interest: "high", notes: PLACEHOLDER },
    { name: "General contractor", role: "Builds it", power: "medium", interest: "high", notes: PLACEHOLDER },
    { name: "Permit authority / inspector", role: "Approves and inspects", power: "high", interest: "medium", notes: PLACEHOLDER },
    { name: "Facilities or end-user representative", role: "Uses the space afterwards", power: "low", interest: "medium", notes: PLACEHOLDER },
  ],
  assumptions: [
    "The site is accessible and has no unknown conditions",
    "Permit review times match the authority's published timelines",
  ],
};

export const PROJECT_TEMPLATES: ProjectTemplate[] = [processImprovement, eventCampaign, softwareLaunch, construction];

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === "string" && PROJECT_TEMPLATES.some((t) => t.id === v);
}

export function getTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}

/** What applying a template adds, for the "this will add..." line. */
export function templateCounts(t: ProjectTemplate) {
  return {
    phases: t.phases.length,
    milestones: t.milestones.length,
    tasks: t.tasks.length,
    risks: t.risks.length,
    stakeholders: t.stakeholders.length,
    assumptions: t.assumptions.length,
  };
}

export function templateSummary(t: ProjectTemplate): string {
  const c = templateCounts(t);
  return `${c.phases} phases, ${c.milestones} milestones, ${c.tasks} starter tasks, ${c.risks} risks, ${c.stakeholders} stakeholder roles and ${c.assumptions} assumptions`;
}

export type PlannedPhase = { title: string; startDay: number; endDay: number };

/** Phases laid end to end: each starts the day the previous one ends. */
export function planPhases(t: ProjectTemplate): PlannedPhase[] {
  let cursor = 0;
  return t.phases.map((p) => {
    const startDay = cursor;
    cursor += p.days;
    return { title: p.title, startDay, endDay: cursor };
  });
}
