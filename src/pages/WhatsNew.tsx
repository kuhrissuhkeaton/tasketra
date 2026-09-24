import { AppSidebar } from "../components/AppSidebar";

type ChangeEntry = { version: string; date: string; title: string; body: string };

// A user-facing summary of what's shipped, in plain language -- not the full
// engineering changelog (that lives in the internal knowledge base). Add a
// new entry here each time a release ships something worth telling users
// about; skip pure bug fixes and internal refactors that don't change what
// they can do.
const CHANGES: ChangeEntry[] = [
  {
    version: "v69",
    date: "September 2026",
    title: "Categorize vendors by role, category, and sub-category",
    body: "The Vendors tab now has three optional new fields: Role (e.g. \"Vendor for,\" \"Subcontractor to\"), Category, and Sub-category. Use them however fits your vendor list -- free text, not a fixed list -- so it's easy to scan who's who at a glance instead of just names and dollar amounts.",
  },
  {
    version: "v68",
    date: "September 2026",
    title: "Filter the Dashboard by project, and see issues by severity",
    body: "The Dashboard now has a filter bar -- pick a single project to see just its numbers, or stay on \"All projects\" for the full portfolio rollup. And there's a new chart: open issues broken down by severity (Low, Medium, High/Critical), right next to the tasks-by-status chart, so you can see where the risk is concentrated without opening every project's Issues tab.",
  },
  {
    version: "v67",
    date: "September 2026",
    title: "A softer, less boxed-in look",
    body: "A visual pass on cards, tables, and lists across the entire app -- less 1px-border-around-everything, more breathing room. Today's \"needs attention\" list, the feed, and the activity/decision log all drop the boxed card look for soft shadows (with color-coded left accents kept where they carry meaning). Tables (Tasks, Issues, Risks, Vendors, Quality, and the rest), the Roadmap timeline, and project/resource/template/kanban cards all lose their heavy outlines in favor of a soft shadow. The Roadmap's filter chips are now solid-filled instead of outlined. Same information, same colors -- just a calmer surface underneath all of it.",
  },
  {
    version: "v66",
    date: "September 2026",
    title: "Detail panels for tasks, issues, and risks -- plus task notes and RAID-to-task links",
    body: "Tasks, Issues, and Risks each get a proper Details panel now instead of a cramped inline edit row -- click \"Details\" on any row to open it. Tasks also have a Notes field for the first time, for context that doesn't fit in a title. And a Risk or Issue can now name the specific task(s) it blocks, right from its own Details panel -- that task's own panel shows a \"Blocked by\" list linking back, so the connection between a risk and the work it threatens is finally something the app tracks, not just something you remember. The Roadmap chart also grew a row of type/status filter chips to hide what you don't need to see, and a manual zoom (Week/Month/Quarter) to override the automatic fit when you want more or less detail.",
  },
  {
    version: "v65",
    date: "September 2026",
    title: "Click through from Home",
    body: "The \"needs attention\" cards on Home -- blocked tasks, stale tasks, high-severity issues, high-exposure risks -- used to be plain text. Click one now and it jumps straight to that item on its own tab and highlights it, the same click-through Roadmap items already had.",
  },
  {
    version: "v64",
    date: "September 2026",
    title: "A real Dashboard, and OKR tracking",
    body: "Dashboard is no longer just a project list -- it now rolls up KPIs, a tasks-by-status chart, upcoming milestones, and a project-by-project health read across everything you can see, auto-populated from what's already in each project. And there's real OKR tracking: every project gets a new OKRs tab (under Goals) for setting objectives with a status, breaking each one into key results with start, current, and target values, and watching progress compute itself instead of tracking percentages by hand. Objective and key-result progress rolls straight up into the new Dashboard too, both per project and across your whole portfolio.",
  },
  {
    version: "v63",
    date: "September 2026",
    title: "A cleaner nav -- Issues & risks moved to the sidebar",
    body: "Issues, Risks, Assumptions, Dependencies, Quality, and Compliance used to open a second row of tabs stacked right under the main nav -- confusing, and it only got busier once Risks grew a Matrix view on top. Those six now live in the sidebar under their own \"Issues & risks\" group, the same place Vendors and the Comms plan already live. And everywhere else in the app with its own List/Board/Matrix-style view switch (Tasks, Home, Decisions, the Weekly report) now uses a visibly quieter style for that switch, so it reads as \"options for this page\" instead of another row of navigation.",
  },
  {
    version: "v62",
    date: "September 2026",
    title: "Closure, a risk matrix, a comms plan, and compliance tracking",
    body: "Four more PMI-aligned additions, all shipping together. Risks now has a Matrix view alongside List and Board -- a probability-by-impact grid so exposure is visible at a glance instead of read off a table. There's a new Comms plan tab (under People & decisions) for who needs what information, how often, and by what channel. RAID gets a sixth tab, Compliance, for regulatory, policy, standard, or contractual obligations, tracked the same way as Quality. And a new Closure tab (under Documents & output) gives every project a lightweight close-out checklist, an at-a-glance read on what's still open, and a way to mark a project closed (and reopen it any time) without archiving or locking anything.",
  },
  {
    version: "v61",
    date: "September 2026",
    title: "Vendor tracking and a capacity read on your team",
    body: "There's a new Vendors tab under People & decisions for procurement -- log a vendor, contract, or purchase order with a category, owner, cost, and start/end dates, and track it from requested through active to completed, the same list/board pattern as the rest of RAID. Team's Workload table now shows a Capacity column too, reading each owner's open, blocked, and overdue tasks into an On track / Busy / Overloaded signal -- no hour estimates, just a faster read on who's underwater.",
  },
  {
    version: "v60",
    date: "September 2026",
    title: "Quality tracking, risk-to-issue, and a contingency reserve",
    body: "RAID has a fifth tab -- Quality -- for standards to meet, reviews to run, and defects you've found, tracked the same way as Issues and Risks. A Risk row now has a \"This became an issue\" action that creates the matching issue and marks the risk resolved in one step. And Budget's approved-budget field now sits next to an optional contingency reserve, tracked separately from your EVM metrics.",
  },
  {
    version: "v59",
    date: "September 2026",
    title: "Click a chart item to edit it",
    body: "Clicking a bar or milestone on the Roadmap chart now jumps straight to that item in the list below and opens it for editing, so you no longer have to scroll down and hunt for the matching row.",
  },
  {
    version: "v58",
    date: "September 2026",
    title: "A clearer roadmap",
    body: "Milestones now show their name right on the timeline instead of only on hover, and every item's type (phase, milestone, release, event, or note) gets its own accent color so you can tell what you're looking at at a glance. Undated items now sit next to their swimlane on the chart instead of in a separate list below it. \"New roadmap item\" is now a button instead of an always-open form, and the share-link settings moved below the roadmap list to keep the page focused on the plan itself.",
  },
  {
    version: "v57",
    date: "September 2026",
    title: "Resize any column, anywhere",
    body: "Every table in the app -- Tasks, RAID, Budget, Roadmap, Meetings, Documents, and the rest -- now lets you drag a column's edge to make it wider, so a long title, email, or note isn't cut off with nowhere to go. Double-click the edge to auto-fit the column to its content. Your column widths are remembered the next time you visit.",
  },
  {
    version: "v56",
    date: "September 2026",
    title: "Shorter dates and times",
    body: "Timestamps across the app -- Feed, Trash, decision records, weekly reports, and the admin pages -- used to show the full \"9/15/2026, 4:39:12 PM\" format. They now read as \"Sep 15, 4:39 PM\" (or just \"Sep 15, 2026\" where only the date matters), dropping seconds and the year when it's the current one.",
  },
  {
    version: "v55",
    date: "September 2026",
    title: "Icons in the sidebar",
    body: "Every sidebar tab -- Dashboard, Stakeholders, Decisions, Documents, all of it -- now has an icon alongside its label, so you can spot a tab by shape as well as by reading it.",
  },
  {
    version: "v54",
    date: "September 2026",
    title: "Board view everywhere in RAID, and a running start",
    body: "Assumptions and Dependencies now have the same Board view Issues and Risks got last release -- drag a card between columns to update its status. Starting a new project? Check \"Start with example data\" and we'll pre-fill it with sample tasks, a roadmap, and one of each RAID item, so you've got something to click around instead of five empty tabs. Pages should also feel snappier -- they now load only the code they actually need.",
  },
  {
    version: "v53",
    date: "September 2026",
    title: "Act on Home without leaving it",
    body: "Blocked and stale tasks, open issues, and open risks on your Home tab now have a status dropdown and a Reassign button right on the row -- no more clicking through to Tasks or RAID just to nudge something along. Decisions waiting on a stakeholder get a one-click Copy link too.",
  },
  {
    version: "v52",
    date: "September 2026",
    title: "Board view for Issues and Risks",
    body: "Issues and Risks now have a Board view alongside List, same as Tasks -- drag a card between Open, In progress/Monitoring, and Resolved columns to update its status. Each card shows severity or exposure at a glance.",
  },
  {
    version: "v51",
    date: "September 2026",
    title: "Set a status when you add something",
    body: "Tasks, roadmap items, issues, risks, assumptions, and dependencies now let you pick a status right when you create them -- handy for backfilling a project that's already underway. Roadmap items are also now editable inline, just like the rest.",
  },
  {
    version: "v50",
    date: "September 2026",
    title: "A tour for your first project",
    body: "Create your first project and a quick walkthrough shows you around: Roadmap, Tasks, RAID, Meetings, Decisions, Budget, Team, and Templates. Missed it or want to see it again? Find \"Replay the tour\" on the Resource hub.",
  },
  {
    version: "v49",
    date: "September 2026",
    title: "A place to talk to other PMs",
    body: "Tasketra's Discord community is live -- swap interview questions, vent about your week, or tell us what to fix in the app. Find the link under Community in the sidebar.",
  },
  {
    version: "v48",
    date: "August 2026",
    title: "Feedback, properly this time",
    body: "The Feedback link now opens a quick in-app form instead of just firing off an email -- and if what you asked for ships, you'll hear back directly.",
  },
  {
    version: "v29",
    date: "August 2026",
    title: "You're looking at it",
    body: "A What's new page, so you can see what's changed without asking. Also added a small Beta tag around the app, and a Feedback link in the sidebar if something's broken or missing.",
  },
  {
    version: "v28",
    date: "August 2026",
    title: "Connections",
    body: "Send a project's activity (tasks, issues, decisions, and more) to any webhook URL -- Zapier, Make, Slack, or your own endpoint. Turn it on per project from the new Connections tab.",
  },
  {
    version: "v26",
    date: "August 2026",
    title: "Change requests & lessons learned",
    body: "Track scope changes with schedule/budget impact and an approval workflow, right inside Decisions. Log what went well, what didn't, and action items as you go, right inside Weekly report.",
  },
  {
    version: "v25",
    date: "August 2026",
    title: "Team workload view",
    body: "The Team tab now shows open, blocked, and overdue task counts per person, so you can see who's stretched thin at a glance.",
  },
  {
    version: "v24",
    date: "August 2026",
    title: "Complete RAID tracking",
    body: "Assumptions and Dependencies joined Issues and Risks as fully tracked items, right where the rest of your RAID log already lives.",
  },
  {
    version: "v22",
    date: "August 2026",
    title: "A real PM reference library",
    body: "The Resource hub grew a RAID log guide, a stakeholder engagement matrix, meeting cadence templates, and status-reporting tips -- all searchable.",
  },
  {
    version: "v21",
    date: "August 2026",
    title: "Friendlier delete confirmations",
    body: "Replaced the browser's native confirmation popups with an on-brand confirm dialog across the app.",
  },
  {
    version: "v18",
    date: "July 2026",
    title: "New look",
    body: "A persistent sidebar, cleaner navigation, and Tasketra's current visual identity.",
  },
];

export default function WhatsNew() {
  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>What's new</h1>
        </div>
        <p className="muted" style={{ marginBottom: 28, maxWidth: 640 }}>
          Tasketra is in beta and shipping regularly. Here's what's changed recently -- if
          something you rely on isn't here yet, use the Feedback link in the sidebar to let us
          know.
        </p>

        <div className="whats-new-list">
          {CHANGES.map((c) => (
            <div className="whats-new-entry" key={c.version}>
              <div className="whats-new-meta">
                <span className="pill pill-navy">{c.version}</span>
                <span className="muted">{c.date}</span>
              </div>
              <h4>{c.title}</h4>
              <p className="muted">{c.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
