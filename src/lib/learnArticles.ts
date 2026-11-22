// v172 (Plan A): the Learn articles. Every register and weekly surface
// in the app links here from its "How this works" disclosure and its
// teaching empty state (/app/resources?article=<slug>). The text grows
// out of the explainers that used to sit inline on those surfaces:
// short, plain, and written for someone in the middle of real work.
//
// `tab` is where the article's subject lives inside a project, used by
// the article page's "In your project" card.

export type LearnShelf = "learn" | "reference";

export type LearnArticle = {
  slug: string;
  title: string;
  blurb: string;
  shelf: LearnShelf;
  tab: string;
  tabLabel: string;
  body: string[];
};

export const LEARN_ARTICLES: LearnArticle[] = [
  {
    slug: "risks",
    title: "How risks work",
    blurb: "Anything that might go wrong, written down before it does.",
    shelf: "reference",
    tab: "risks",
    tabLabel: "Risks",
    body: [
      "A risk is anything that might go wrong, written down before it does. The point of the register is not the list itself. It is that each risk gets thought about while there is still time to do something cheap about it.",
      "Score each risk on probability and impact, 1 to 5. The exposure band (low, medium, high) follows from the two scores, and the register sorts by exposure so the dangerous ones sit on top. A risk with no score and no owner is not being managed yet, so the register calls those out in the Needs a look group.",
      "Write the mitigation while the risk is still hypothetical: what you will do now to make it less likely, or less painful if it lands. Give it a named owner. And when a risk actually happens, turn it into an issue from its card, so the history carries over instead of starting again from a blank page.",
    ],
  },
  {
    slug: "issues",
    title: "How issues work",
    blurb: "Problems that are already here, with an owner and a status.",
    shelf: "reference",
    tab: "issues",
    tabLabel: "Issues",
    body: [
      "An issue is a problem that is already here: a blocker, a failure, a disagreement that is stopping work now. It gets logged so it has an owner and a status, instead of living as a mention in a meeting that everyone forgets by Friday.",
      "The difference from a risk is timing. A risk might happen. An issue has happened. When a risk turns real, promote it from the Risks register and it becomes an issue with its history attached.",
      "Rate severity honestly. High and critical issues are the ones the project home and the health verdict pay attention to, so a register where everything is critical teaches people to ignore all of it. Resolve issues in the open, where the team can see the count coming down.",
    ],
  },
  {
    slug: "assumptions",
    title: "How assumptions work",
    blurb: "What the plan treats as true, with a date to re-check it.",
    shelf: "reference",
    tab: "assumptions",
    tabLabel: "Assumptions",
    body: [
      "Every plan treats some things as true without proof: the vendor will deliver on time, the budget will be approved, the team will stay the size it is. An assumption is one of those, written down on purpose.",
      "The register exists because assumptions fail quietly. Nobody announces that the thing everyone counted on stopped being true. So each assumption gets a check date, the day someone will look at it again and confirm it still holds.",
      "When an assumption turns out wrong, that is not a paperwork event. It usually moves dates, money, or scope, so mark it wrong in the register and revisit the plan in the same sitting, while the consequences are still cheap.",
    ],
  },
  {
    slug: "dependencies",
    title: "How dependencies work",
    blurb: "What this project is waiting on, and when it is needed by.",
    shelf: "reference",
    tab: "dependencies",
    tabLabel: "Dependencies",
    body: [
      "A dependency is work that cannot start or finish until something else happens first. The something else can be internal, another task or another team, or external: a vendor delivery, a client approval, a regulatory step.",
      "Log what you are waiting on and the date you need it by. That date is what makes the register useful, because a dependency drifting past its needed-by date shows up as late in the counts before it stops the work, while there is still time to chase it or plan around it.",
      "Chase dependencies like tasks. Each one wants an owner on your side, even when the work sits on someone else's side, because the other side rarely feels your deadline the way you do.",
    ],
  },
  {
    slug: "quality",
    title: "How quality works",
    blurb: "Standards to meet, reviews to run, defects to answer for.",
    shelf: "reference",
    tab: "quality",
    tabLabel: "Quality",
    body: [
      "The quality log answers a different question from the issue log. Issues ask whether something is broken. Quality asks whether the work is good enough: the standard it has to meet, the review it has to pass, the defect that has to be fixed before anyone calls it done.",
      "Log the standard, the review, or the defect, give it an owner, and mark it passed or failed as the evidence comes in. A failed quality item is information, not blame. It is far cheaper here than in a customer's hands.",
      "Quality sits inside RAID because it behaves like the rest of the family: it needs an owner, a status, and a regular look, or it quietly stops happening.",
    ],
  },
  {
    slug: "compliance",
    title: "How compliance works",
    blurb: "Obligations the project has to satisfy, each with a date.",
    shelf: "reference",
    tab: "compliance",
    tabLabel: "Compliance",
    body: [
      "A compliance item is an obligation the project has to satisfy: a regulation, a policy, a standard, a clause in a contract. It is tracked separately from quality because are we allowed to do this is a different question from is this good enough.",
      "Each item gets an owner and a due date. Compliance work has a habit of surfacing at the worst moment, usually right before a launch or an audit, so the register's job is to make the obligation visible while it is still boring.",
      "Mark items compliant only on evidence: the approval received, the document filed, the review signed off. If it is not satisfied yet, the honest status is worth more than a hopeful one.",
    ],
  },
  {
    slug: "budget",
    title: "How the budget works",
    blurb: "Work budget, reserve, and the earned value picture.",
    shelf: "reference",
    tab: "budget",
    tabLabel: "Budget",
    body: [
      "The work budget is what the project itself may spend. A contingency reserve, if you set one, sits beside it for known risks. The reserve is real money, but it is not counted in the earned value figures, because spending the reserve is a decision, not a drift.",
      "Every cost you log feeds the spent total. Earned value then compares three numbers: the work that was planned by now (PV), the work actually done, priced at budget rates (EV), and what that work really cost (AC). From those come the two indexes worth knowing. CPI above 1 means work is costing less than planned. SPI above 1 means it is ahead of pace.",
      "The forecast, EAC, projects the final cost if today's efficiency continues. Early in a project it swings a lot, because a handful of tasks is not a pattern. Treat it as a rough guide until a third of the work is done, then start treating it as a promise you need to manage.",
    ],
  },
  {
    slug: "vendors",
    title: "How vendors work",
    blurb: "Who you are buying from, what it costs, where it stands.",
    shelf: "reference",
    tab: "procurement",
    tabLabel: "Vendors",
    body: [
      "The vendor register tracks who you are buying from or contracting with, what it costs, and where the agreement stands. It sits apart from Tasks because do we have an agreement with this vendor is a different question from is this task done.",
      "Log a vendor when sourcing starts, not when the contract signs. The requested and in-progress states are where the delays live, and a register that only shows signed contracts hides exactly the part that needs managing.",
      "Keep the cost on the vendor row current. Together the register answers the two questions sponsors actually ask: who are we committed to, and what have we promised to pay them.",
    ],
  },
  {
    slug: "documents",
    title: "How documents work",
    blurb: "The project's reference library, close at hand.",
    shelf: "reference",
    tab: "documents",
    tabLabel: "Documents",
    body: [
      "Documents is the project's reference library: specs, contracts, and other material the team needs close at hand while the work runs. If people keep asking where something lives, it belongs here.",
      "PDF, Word, Excel, and image files up to 5MB can be uploaded. To update a document, delete the old copy and upload the new one, so nobody works from a stale version by accident.",
      "Documents are reference, not workflow. Decisions about a document still belong in Decisions, and work on it belongs in Tasks. This shelf just makes sure the current version is one click away.",
    ],
  },
  {
    slug: "stakeholders",
    title: "How stakeholders work",
    blurb: "Power and interest, and how closely to keep each person.",
    shelf: "learn",
    tab: "stakeholders",
    tabLabel: "Stakeholders",
    body: [
      "A stakeholder is anyone with a stake in the project: sponsors, customers, the teams doing the work, and anyone who can help it or block it. The register is the project's memory of who those people are and what they need.",
      "Rate each person on power, how much they can affect the project, and interest, how much they care. The grid view places everyone on those two axes. High power and high interest means keep them closely involved, with real detail and early sight of problems. High power and low interest means keep them satisfied with short, high-level updates, and no surprises.",
      "The ratings are a working tool, not a judgment of the person. They change as the project moves, so revisit them when the phases change, and keep contact details current so the register is the place people actually look.",
    ],
  },
  {
    slug: "decisions",
    title: "How decisions work",
    blurb: "Ask for a decision like you mean it: who, what, by when.",
    shelf: "learn",
    tab: "decisions",
    tabLabel: "Decisions",
    body: [
      "Projects stall on unmade decisions more than on any other single thing. A decision request makes the ask concrete: who decides, what the options are, and the date the answer is needed by. The decider gets a link, answers from it, and the answer lands back in the register.",
      "The waiting count is the number to watch. A decision that has waited a week is usually not being considered, it is being avoided, so the register shows how long each one has been waiting and offers a nudge you can copy and send.",
      "Decided is not the end of the record. Months later, when someone asks why the project went the way it did, the decided list is the answer, with the date and the decider attached. Scope changes worth a paper trail go in Change requests, in this same tab.",
    ],
  },
  {
    slug: "meetings",
    title: "How meetings work",
    blurb: "A record of who was there, what was decided, what is owed.",
    shelf: "learn",
    tab: "meetings",
    tabLabel: "Meetings",
    body: [
      "The meetings log is a record of the meetings that actually drive the project: who was there, what was decided, and the action items that came out of it. Meetings that produce none of those three rarely needed to happen.",
      "Action items are the point. Logged here, they carry into the project's work instead of evaporating when the call ends, and the open action item count tells you whether meetings are producing commitments or just conversation.",
      "Use the agenda templates in Learn to give recurring meetings a shape: the kickoff, the weekly status, the steering session, and the retro each have a ready-made agenda, so the record starts consistent.",
    ],
  },
  {
    slug: "comms",
    title: "How the comms plan works",
    blurb: "One row per audience: what they hear, how often, by what channel.",
    shelf: "learn",
    tab: "comms",
    tabLabel: "Comms Plan",
    body: [
      "A communications plan answers three questions for every audience the project has: what do they need to hear, how often, and by what channel. One row per audience keeps it a reference you can check in ten seconds.",
      "It is a plan, not a workflow, so rows have no status. When the arrangement changes, edit the row. When an audience stops mattering, remove it. A short, current plan beats a long, stale one every time.",
      "Most project friction that looks like a people problem is a comms problem underneath: someone senior heard about a problem too late, or a team got detail it never needed. The plan is where you fix that on purpose instead of by accident.",
    ],
  },
  {
    slug: "change-requests",
    title: "How change requests work",
    blurb: "Scope changes with a paper trail: what, why, who, and the cost.",
    shelf: "learn",
    tab: "decisions",
    tabLabel: "Decisions",
    body: [
      "A change request records a scope change worth a paper trail: what is changing, why, who asked for it, and what it does to the schedule and the budget. Small changes ride along in Tasks. The ones that move dates or money belong here.",
      "The value is the assessment, not the form. Writing down the schedule and budget effect before approval turns a casual yes into an informed one, and it gives the sponsor the trade in plain terms: this addition costs these days or this money.",
      "Change requests live in the Decisions tab because that is what they are: decisions, with consequences attached. Approved, they become part of the plan. Declined, they stay on record, so the same ask does not return every month wearing a new hat.",
    ],
  },
  {
    slug: "okrs",
    title: "How OKRs work",
    blurb: "Outcomes the project is driving toward, and the results that prove them.",
    shelf: "learn",
    tab: "okrs",
    tabLabel: "OKRs",
    body: [
      "OKRs are the handful of outcomes this project is actually driving toward, stated separately from the day-to-day work. Tasks say what people are doing. Objectives say where the project is going, and key results say whether it is getting there.",
      "A good key result is measurable without argument: a number, a date, a count. If reasonable people could disagree about whether it happened, it is not finished being written yet. A few key results per objective is plenty; a long list dilutes the few that matter.",
      "Charter objectives can become OKRs in one click from the Charter, so the thinking done at kickoff carries straight in. Progress rolls up onto the portfolio Dashboard, which is where OKRs earn their keep across projects: leadership sees outcomes, not activity.",
    ],
  },
  {
    slug: "lessons",
    title: "How lessons work",
    blurb: "What went well, what did not, logged while it is still fresh.",
    shelf: "learn",
    tab: "closure",
    tabLabel: "Closure",
    body: [
      "Lessons are the project's memory of itself: what went well, what did not, and what to change next time. They are logged in Closure, but they are not only for the end. Log one any time something teaches you something, while the details are still fresh.",
      "A useful lesson names the situation and the change, not just the feeling. Vendor reviews need two weeks, not two days is a lesson a future project can act on. Communication could be better is not.",
      "The retro template in Learn gives the end-of-project session a shape. The lessons written there are the ones the next project inherits, which is the whole point of writing them down.",
    ],
  },
];

export function articleBySlug(slug: string | null | undefined): LearnArticle | null {
  if (!slug) return null;
  return LEARN_ARTICLES.find((a) => a.slug === slug) ?? null;
}
