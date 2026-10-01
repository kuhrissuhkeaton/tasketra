import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "../components/AppSidebar";
import { ResizableTable } from "../components/ResizableTable";
import { api } from "../lib/api";
import { PROJECT_TEMPLATES, planPhases, templateSummary } from "../lib/projectTemplates";
import { APPROACH_LABEL } from "../lib/projectView";
import { GUIDE_STAGES } from "../lib/hubGuide";
import { FormsAndDownloads } from "../components/FormsAndDownloads";
import { ProjectFlowGuide } from "../components/ProjectFlowGuide";

type Methodology = { name: string; points: string[]; bestWhen: string };

const METHODOLOGIES: Methodology[] = [
  {
    name: "Agile",
    points: [
      "Iterative, incremental delivery in short cycles",
      "Embraces changing requirements rather than locking them upfront",
      "Frequent stakeholder feedback and high customer involvement",
      "Common in software, product, and startup teams",
    ],
    bestWhen: "Speed, flexibility, and evolving requirements matter more than a fixed upfront plan.",
  },
  {
    name: "Waterfall",
    points: [
      "Linear, sequential phases -- each one finishes before the next starts",
      "Scope, cost, and timeline defined upfront",
      "Heavy documentation and a clear, traceable plan",
    ],
    bestWhen: "Requirements are fixed, well understood, and unlikely to change mid-project.",
  },
  {
    name: "Hybrid",
    points: [
      "Combines Agile execution with Waterfall-style phase gates",
      "Structured where it needs to be, flexible where it can be",
      "Customizable by project phase",
      "Reduces risk while staying adaptive",
    ],
    bestWhen: "Large or complex projects need both governance and the ability to adapt.",
  },
  {
    name: "Lean",
    points: [
      "Focused on maximizing value while eliminating waste",
      "Continuous improvement mindset",
      "Strong process optimization",
    ],
    bestWhen: "Cost, efficiency, and speed are the primary constraints.",
  },
  {
    name: "Six Sigma",
    points: [
      "Data-driven, defect-reduction methodology",
      "Uses the DMAIC framework: Define, Measure, Analyze, Improve, Control",
      "Strong statistical analysis of process variation",
    ],
    bestWhen: "Quality and consistency are non-negotiable.",
  },
  {
    name: "Scrum",
    points: [
      "A specific Agile framework built on time-boxed sprints",
      "Clear roles: Product Owner, Scrum Master, Development Team",
      "Daily stand-ups and sprint reviews",
      "Backlog-driven delivery",
    ],
    bestWhen: "A small team needs a tight feedback loop with clearly defined roles.",
  },
  {
    name: "Kanban",
    points: [
      "Visual, continuous-flow board rather than fixed sprints",
      "Limits work in progress (WIP) to keep flow healthy",
      "Improves transparency across the whole team",
      "This is exactly what Tasketra's own Kanban board supports",
    ],
    bestWhen: "Workflow visibility and steady throughput matter more than sprint ceremony.",
  },
  {
    name: "PRINCE2",
    points: [
      "Process-based methodology with defined stages and roles",
      "Strong documentation and business justification requirements",
      "Rigorous reporting and formal sign-off at each stage gate",
    ],
    bestWhen: "Compliance, audit trails, and governance are central to the project.",
  },
];

type Formula = { code: string; name: string; formula: string; meaning: string };

const FORMULAS: Formula[] = [
  { code: "BAC", name: "Budget at Completion", formula: "Total approved budget", meaning: "The baseline everything else is measured against." },
  { code: "PV", name: "Planned Value", formula: "% planned complete x BAC", meaning: "Budgeted value of the work that should be done by now." },
  { code: "EV", name: "Earned Value", formula: "% actual complete x BAC", meaning: "Budgeted value of the work actually completed." },
  { code: "AC", name: "Actual Cost", formula: "Money spent so far", meaning: "What's actually been paid out to date." },
  { code: "CV", name: "Cost Variance", formula: "EV - AC", meaning: "Positive means under budget, negative means over." },
  { code: "SV", name: "Schedule Variance", formula: "EV - PV", meaning: "Positive means ahead of schedule, negative means behind." },
  { code: "CPI", name: "Cost Performance Index", formula: "EV / AC", meaning: "Above 1.0 is cost-efficient, below 1.0 is overspending." },
  { code: "SPI", name: "Schedule Performance Index", formula: "EV / PV", meaning: "Above 1.0 is ahead of pace, below 1.0 is behind." },
  { code: "EAC", name: "Estimate at Completion", formula: "BAC / CPI", meaning: "Forecasted total cost if current efficiency holds." },
  { code: "ETC", name: "Estimate to Complete", formula: "EAC - AC", meaning: "Projected cost remaining from today to the finish." },
  { code: "VAC", name: "Variance at Completion", formula: "BAC - EAC", meaning: "Projected under/over budget at the finish." },
  { code: "TCPI", name: "To-Complete Performance Index", formula: "(BAC - EV) / (BAC - AC)", meaning: "Efficiency required on remaining work to land on budget." },
  { code: "Float", name: "Schedule / Total Float", formula: "LS - ES  (or LF - EF)", meaning: "How much a task can slip before it delays the project." },
  { code: "PERT", name: "PERT Estimate", formula: "(O + 4M + P) / 6", meaning: "Weighted average duration from optimistic (O), most likely (M), and pessimistic (P) estimates." },
  { code: "Comms", name: "Communication Channels", formula: "n x (n - 1) / 2", meaning: "Number of communication lines for n stakeholders or team members." },
];

type RaidItem = { term: string; definition: string; example: string; whereInApp: string };

const RAID_GUIDE: RaidItem[] = [
  {
    term: "Risks",
    definition: "Things that might happen and would affect the project if they did -- scored by probability and impact.",
    example: "\"Our main contractor might be double-booked during install week.\"",
    whereInApp: "Tracked natively in each project's Issues & risks tab, with probability/impact scoring and an auto-calculated exposure level.",
  },
  {
    term: "Issues",
    definition: "Things that have already happened and need action now -- no more probability, just severity and an owner.",
    example: "\"The permit office rejected our filing; we need a revised submission.\"",
    whereInApp: "Tracked natively alongside Risks in Issues & risks, with severity levels and status.",
  },
  {
    term: "Assumptions",
    definition: "Things you're treating as true for planning purposes, without proof -- worth writing down because the plan breaks if they're wrong.",
    example: "\"We're assuming the client's IT team can grant access within 3 business days.\"",
    whereInApp: "Tracked natively in each project's Issues & risks tab (Assumptions view), with a status of unconfirmed, confirmed, or invalidated.",
  },
  {
    term: "Dependencies",
    definition: "Work that can't start or finish until something else does -- internal (another task) or external (a vendor, a client deliverable, a regulatory step).",
    example: "\"Framing can't start until the permit is approved.\"",
    whereInApp: "Tracked natively in each project's Issues & risks tab (Dependencies view), tagged internal or external with an optional needed-by date. Internal task-to-task ordering also shows up naturally in the WBS hierarchy and Timeline view.",
  },
];

type Quadrant = { name: string; axis: string; strategy: string };

const STAKEHOLDER_QUADRANTS: Quadrant[] = [
  { name: "Manage closely", axis: "High power, high interest", strategy: "Your key players. Involve them in decisions, brief them first, and never let them be surprised by news." },
  { name: "Keep satisfied", axis: "High power, low interest", strategy: "Keep them content with outcomes, not details. Enough information that they stay supportive without needing a play-by-play." },
  { name: "Keep informed", axis: "Low power, high interest", strategy: "They care and can influence opinion even without formal authority. Regular updates keep them as allies, not surprises." },
  { name: "Monitor", axis: "Low power, low interest", strategy: "Minimal effort -- a periodic check-in is enough. Watch for movement into another quadrant as the project evolves." },
];

type MeetingTemplate = { name: string; cadence: string; purpose: string; agenda: string[] };

const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    name: "Kickoff",
    cadence: "Once, at project start",
    purpose: "Align everyone on scope, roles, and how the project will run before real work begins.",
    agenda: [
      "Project goals and success criteria",
      "Scope: what's in, what's explicitly out",
      "Roles, owners, and decision rights",
      "High-level timeline and key milestones",
      "How and when status will be communicated",
    ],
  },
  {
    name: "Steering / status review",
    cadence: "Weekly or biweekly",
    purpose: "Give decision-makers a fast, honest read on progress, budget, and anything blocking the team.",
    agenda: [
      "Progress vs. plan (schedule and budget variance)",
      "Top risks and issues needing visibility or a decision",
      "Blockers and what's needed to clear them",
      "Decisions required from this group today",
      "Look-ahead: what's due before the next check-in",
    ],
  },
  {
    name: "Retro / lessons learned",
    cadence: "At project close (or phase end for longer projects)",
    purpose: "Capture what worked and what didn't while it's still fresh, so the next project starts smarter.",
    agenda: [
      "What went well and should be repeated",
      "What didn't go well and why",
      "Risks/issues that materialized -- were they caught early enough?",
      "One or two concrete changes for the next project",
    ],
  },
];

const STATUS_REPORT_TIPS: string[] = [
  "Lead with the overall health call (on track / at risk / off track) -- don't make readers dig for it.",
  "Report schedule and budget variance in plain language, not just SPI/CPI numbers.",
  "Only surface risks and issues that need attention or awareness -- not the full log.",
  "Name what you need from the reader (a decision, an approval, an introduction) instead of just narrating status.",
  "Keep the format identical every time so recipients can scan it in under a minute.",
];

export default function Resources() {
  const [query, setQuery] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const q = query.trim().toLowerCase();

  // Arriving with #section in the link (for example from the Dashboard tip)
  // scrolls to that section; the jump links only handled clicks before.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hash]);

  async function replayTour() {
    setReplaying(true);
    setReplayNotice(null);
    try {
      const { projects } = await api.listProjects();
      if (projects.length === 0) {
        setReplayNotice("Create a project first, the tour walks through a real one.");
        return;
      }
      navigate(`/app/projects/${projects[0].id}`, { state: { startTour: true, forceReplay: true } });
    } finally {
      setReplaying(false);
    }
  }
  const matches = (...parts: string[]) => !q || parts.some((p) => p.toLowerCase().includes(q));

  const methodologies = METHODOLOGIES.filter((m) => matches(m.name, m.bestWhen, ...m.points));
  const formulas = FORMULAS.filter((f) => matches(f.code, f.name, f.meaning, "EVM", "formula"));
  const raidItems = RAID_GUIDE.filter((r) => matches(r.term, r.definition, r.example, r.whereInApp, "RAID", "RAID log"));
  const quadrants = STAKEHOLDER_QUADRANTS.filter((s) => matches(s.name, s.axis, s.strategy, "stakeholder", "stakeholder matrix"));
  const meetings = MEETING_TEMPLATES.filter((m) => matches(m.name, m.purpose, m.cadence, ...m.agenda, "meeting"));
  const templates = PROJECT_TEMPLATES.filter((t) =>
    matches(t.name, t.blurb, t.bestFor, "template", "templates", "skeleton", ...t.phases.map((p) => p.title), ...t.tasks.map((x) => x.title), ...t.risks.map((x) => x.title)));
  const guideStages = GUIDE_STAGES.filter((st) =>
    matches(st.name, st.goal, st.checklist, "tasketra", "how it works", "stage", "guide", ...st.steps.flatMap((x) => [x.title, x.tab, x.why])));
  const forms = matches("forms", "downloads", "printable", "charter", "risk register", "risk matrix", "raci", "weekly report", "pdf", "share") ? [1] : [];
  const statusTips = STATUS_REPORT_TIPS.filter((t) => matches(t, "status report", "status update"));

  const sections = [
    { id: "templates", label: "Templates", show: templates.length > 0 },
    { id: "forms", label: "Forms & downloads", show: forms.length > 0 },
    { id: "how-it-works", label: "How it works", show: guideStages.length > 0 },
    { id: "methodologies", label: "Methodologies", show: methodologies.length > 0 },
    { id: "formulas", label: "EVM formulas", show: formulas.length > 0 },
    { id: "raid", label: "RAID guide", show: raidItems.length > 0 },
    { id: "stakeholder-matrix", label: "Stakeholder matrix", show: quadrants.length > 0 },
    { id: "meetings", label: "Meetings", show: meetings.length > 0 },
    { id: "status-reports", label: "Status reports", show: statusTips.length > 0 },
  ].filter((x) => x.show);

  function jumpTo(id: string) {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  const nothingMatches =
    templates.length === 0 && forms.length === 0 && guideStages.length === 0 && methodologies.length === 0 && formulas.length === 0 && raidItems.length === 0 &&
    quadrants.length === 0 && meetings.length === 0 && statusTips.length === 0;

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Resource hub</h1>
        </div>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 640 }}>
          Starting points and plain-English reference for running a project: templates to start from,
          forms and downloads to hand to others, a map of how a project runs in Tasketra, then methodologies, EVM formulas, RAID log practice,
          stakeholder mapping, meeting templates, and status reporting. The reference sections are
          read-only; your project's own tabs hold the live data. Templates are the one exception:
          starting from one creates a new project for you.
        </p>

        <div className="inline-form" style={{ marginBottom: 20, alignItems: "center" }}>
          <button type="button" className="btn btn-ghost" onClick={replayTour} disabled={replaying}>
            {replaying ? "Loading..." : "Replay the tour"}
          </button>
          {replayNotice && <span className="muted" style={{ fontSize: 13 }}>{replayNotice}</span>}
        </div>

        <input
          placeholder="Search everything on this page..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 28, maxWidth: 360 }}
        />

        {sections.length > 1 && (
          <nav className="hub-jump" aria-label="Jump to a section">
            {sections.map((x) => (
              <button key={x.id} type="button" className="hub-chip" onClick={() => jumpTo(x.id)}>{x.label}</button>
            ))}
          </nav>
        )}

        {nothingMatches && <p className="muted">Nothing matches "{query}".</p>}

        {templates.length > 0 && (
          <>
            <h2 id="templates">Project templates</h2>
            <p className="muted" style={{ maxWidth: 640, marginTop: 4 }}>
              Start a new project with the skeleton already in place: phases on the roadmap, starter
              tasks tied to those phases, the risks that usually hit this kind of project, and
              stakeholder roles to fill in. Dates are counted from the day you create it, and
              everything can be edited or deleted.
            </p>
            <div className="resource-grid template-grid">
              {templates.map((t) => {
                const planned = planPhases(t);
                return (
                  <div className="resource-card" key={t.id}>
                    <h4>{t.name}</h4>
                    <p>{t.blurb}</p>
                    <p className="muted" style={{ fontSize: 13 }}>
                      <strong>Good for:</strong> {t.bestFor}
                    </p>
                    <p className="template-phases" aria-label="Phases">
                      {t.phases.map((p) => p.title).join(" \u203a ")}
                    </p>
                    <p className="muted" style={{ fontSize: 13 }}>
                      {Math.round(planned[planned.length - 1].endDay / 7)} weeks. Adds {templateSummary(t)}. Works best with the{" "}
                      {APPROACH_LABEL[t.suggestedApproach]} approach.
                    </p>
                    <details className="template-details">
                      <summary>See what's inside</summary>
                      {t.phases.map((p, i) => (
                        <div key={p.title}>
                          <h5>{p.title} <span className="muted">({planned[i].startDay === 0 ? "start" : `week ${Math.floor(planned[i].startDay / 7) + 1}`}, {Math.round(p.days / 7)} wk)</span></h5>
                          <ul>
                            {t.tasks.filter((x) => x.phase === i).map((x) => <li key={x.title}>{x.title}</li>)}
                          </ul>
                        </div>
                      ))}
                      <h5>Risks to watch</h5>
                      <ul>{t.risks.map((x) => <li key={x.title}>{x.title}</li>)}</ul>
                      <h5>Stakeholder roles</h5>
                      <ul>{t.stakeholders.map((x) => <li key={x.name}>{x.name}</li>)}</ul>
                    </details>
                    <button type="button" className="btn btn-primary" onClick={() => navigate(`/app?template=${t.id}`)}>
                      Start a project from this
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {forms.length > 0 && (
          <>
            <h2 id="forms" style={{ marginTop: templates.length > 0 ? 36 : undefined }}>Forms &amp; downloads</h2>
            <p className="muted" style={{ maxWidth: 640, marginTop: 4 }}>
              Documents to hand to a sponsor, client or team, built from a project's live data. Word
              files download straight away; the risk page and weekly report print or save as PDF from
              your browser. Pick the project below.
            </p>
            <FormsAndDownloads />
          </>
        )}

        {guideStages.length > 0 && (
          <>
            <h2 id="how-it-works" style={{ marginTop: templates.length > 0 || forms.length > 0 ? 36 : undefined }}>How a project runs in Tasketra</h2>
            <p className="muted" style={{ maxWidth: 640, marginTop: 4 }}>
              Every project moves through four stages. Pick one to see what to do in it and which tab to do
              it in. Your project's Home tab shows a short checklist for the stage you are in, built from
              what is already in the project, so there are no boxes to tick by hand.
            </p>
            <ProjectFlowGuide stages={guideStages} />
          </>
        )}

        {methodologies.length > 0 && (
          <>
            <h2 id="methodologies" style={{ marginTop: templates.length > 0 || forms.length > 0 || guideStages.length > 0 ? 36 : undefined }}>Methodologies</h2>
            <div className="resource-grid">
              {methodologies.map((m) => (
                <div className="resource-card" key={m.name}>
                  <h4>{m.name}</h4>
                  <ul>
                    {m.points.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                  <div className="callout"><strong>Best when:</strong> {m.bestWhen}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {formulas.length > 0 && (
          <>
            <h2 id="formulas" style={{ marginTop: 36 }}>EVM &amp; scheduling formulas</h2>
            <ResizableTable id="resources-formulas">
              <thead>
                <tr><th>Code</th><th>Name</th><th>Formula</th><th>What it tells you</th></tr>
              </thead>
              <tbody>
                {formulas.map((f) => (
                  <tr key={f.code}>
                    <td><strong>{f.code}</strong></td>
                    <td>{f.name}</td>
                    <td>{f.formula}</td>
                    <td>{f.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </ResizableTable>
          </>
        )}

        {raidItems.length > 0 && (
          <>
            <h2 id="raid" style={{ marginTop: 36 }}>RAID log guide</h2>
            <p className="muted" style={{ maxWidth: 640, marginBottom: 16 }}>
              Risks, Issues, Assumptions, and Dependencies -- the four things worth tracking
              separately so nothing quietly falls through the cracks.
            </p>
            <div className="resource-grid">
              {raidItems.map((r) => (
                <div className="resource-card" key={r.term}>
                  <h4>{r.term}</h4>
                  <p>{r.definition}</p>
                  <div className="callout"><strong>Example:</strong> {r.example}</div>
                  <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{r.whereInApp}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {quadrants.length > 0 && (
          <>
            <h2 id="stakeholder-matrix" style={{ marginTop: 36 }}>Stakeholder engagement matrix</h2>
            <p className="muted" style={{ maxWidth: 640, marginBottom: 16 }}>
              Plot each stakeholder on power vs. interest, then match your effort to the quadrant --
              use this alongside your project's Stakeholders tab.
            </p>
            <div className="resource-grid">
              {quadrants.map((s) => (
                <div className="resource-card" key={s.name}>
                  <h4>{s.name}</h4>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{s.axis}</p>
                  <p>{s.strategy}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {meetings.length > 0 && (
          <>
            <h2 id="meetings" style={{ marginTop: 36 }}>Meeting cadence templates</h2>
            <div className="resource-grid">
              {meetings.map((m) => (
                <div className="resource-card" key={m.name}>
                  <h4>{m.name}</h4>
                  <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{m.cadence}</p>
                  <p>{m.purpose}</p>
                  <ul>
                    {m.agenda.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {statusTips.length > 0 && (
          <>
            <h2 id="status-reports" style={{ marginTop: 36 }}>Status reporting -- what good looks like</h2>
            <div className="resource-card" style={{ maxWidth: 640 }}>
              <ul>
                {statusTips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
