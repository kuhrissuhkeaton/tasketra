import { useEffect, useState } from "react";
import { api, type CharterApproval } from "../lib/api";
import { HowItWorks } from "./Layered";
import { fmtDate } from "../lib/format";
import {
  CHARTER_LIGHT_FIELDS, cleanCharter, isCharterComplete, objectiveLines, sameCharter,
  type Charter, type CharterField,
} from "../lib/charter";
import type { ProjectSize } from "../lib/projectView";

const FIELD_ROWS: { key: CharterField; label: string; rows?: number; hint?: string }[] = [
  { key: "purpose", label: "Purpose. Why does this project exist?", rows: 2 },
  { key: "objectives", label: "Objectives", rows: 3, hint: "One per line." },
  { key: "scope_in", label: "In scope", rows: 3 },
  { key: "scope_out", label: "Out of scope", rows: 3 },
  { key: "sponsor", label: "Sponsor" },
  { key: "budget", label: "Summary budget" },
  { key: "timeline", label: "Summary timeline" },
  { key: "success", label: "Success measures", rows: 2 },
];

/**
 * The project charter, written inside the app. A few short fields on one page,
 * saved with one button. Light projects see only the essentials; the rest show
 * once the project grows, or straight away if they already hold text.
 */
export function CharterTab({
  projectId, projectName, charter, isOwner, size, showAll, okrsVisible, onSaved, onOpenTab,
}: {
  projectId: string;
  projectName: string;
  charter: Charter;
  isOwner: boolean;
  size: ProjectSize;
  showAll: boolean;
  okrsVisible: boolean;
  onSaved: (charter: Charter) => void;
  onOpenTab: (tab: string) => void;
}) {
  const [draft, setDraft] = useState<Charter>(charter);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState("");
  const [goalsMsg, setGoalsMsg] = useState("");
  const [makingGoals, setMakingGoals] = useState(false);
  const [approval, setApproval] = useState<CharterApproval | null>(null);
  const [asking, setAsking] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [copied, setCopied] = useState(false);
  // v172: the charter reads as a document; one section at a time can be
  // open for editing.
  const [editingKey, setEditingKey] = useState<CharterField | null>(null);

  useEffect(() => {
    api.getCharterApproval(projectId).then(({ approval }) => setApproval(approval)).catch(() => {});
  }, [projectId]);

  async function askForApproval() {
    setAsking(true);
    setApprovalError("");
    try {
      const { approval } = await api.requestCharterApproval(projectId);
      setApproval(approval);
    } catch (err: any) {
      setApprovalError(err.message || "Couldn't send the charter for approval.");
    } finally {
      setAsking(false);
    }
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/d/${token}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Follow the saved charter when it changes underneath us (another tab of
  // the same project), but never clobber unsaved typing.
  useEffect(() => {
    setDraft((d) => (sameCharter(d, charter) ? d : sameCharter(d, {}) ? charter : d));
  }, [charter]);

  const dirty = !sameCharter(draft, charter);
  const complete = isCharterComplete(dirty ? draft : charter);
  const shown = FIELD_ROWS.filter(
    (f) => showAll || size !== "light" || CHARTER_LIGHT_FIELDS.includes(f.key) || !!charter[f.key]?.trim(),
  );
  const isShown = (k: CharterField) => shown.some((f) => f.key === k);
  const set = (k: CharterField, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSavedAt(false);
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const clean = cleanCharter(draft);
      const { project } = await api.updateProject(projectId, { charter: clean });
      onSaved(project.charter ?? clean);
      setSavedAt(true);
    } catch (err: any) {
      setError(err.message || "Couldn't save the charter.");
    } finally {
      setSaving(false);
    }
  }

  async function turnIntoGoals() {
    const lines = objectiveLines(draft.objectives);
    if (lines.length === 0) return;
    setMakingGoals(true);
    setGoalsMsg("");
    try {
      const { objectives } = await api.listObjectives(projectId);
      const have = new Set(objectives.map((o) => o.title.trim().toLowerCase()));
      const fresh = lines.filter((l, i) => !have.has(l.toLowerCase()) && lines.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i);
      for (const title of fresh) await api.createObjective(projectId, title);
      const skipped = lines.length - fresh.length;
      setGoalsMsg(
        fresh.length === 0
          ? "Those are all in OKRs already."
          : `Added ${fresh.length} ${fresh.length === 1 ? "goal" : "goals"} to OKRs.${skipped > 0 ? ` ${skipped} already there.` : ""}`,
      );
    } catch (err: any) {
      setGoalsMsg(err.message || "Couldn't add those goals.");
    } finally {
      setMakingGoals(false);
    }
  }

  const fieldEl = (f: (typeof FIELD_ROWS)[number], id: string) => (
    <div key={f.key} className="charter-field">
      <label htmlFor={id}>{f.label}</label>
      {f.rows ? (
        <textarea id={id} rows={f.rows} value={draft[f.key] ?? ""} disabled={!isOwner} onChange={(e) => set(f.key, e.target.value)} />
      ) : (
        <input id={id} type="text" value={draft[f.key] ?? ""} disabled={!isOwner} onChange={(e) => set(f.key, e.target.value)} />
      )}
    </div>
  );
  const byKey = (k: CharterField) => FIELD_ROWS.find((f) => f.key === k)!;

  // v172 (Plan A): document headings are short; the guiding questions
  // stay on the form labels shown while editing.
  const DOC_LABEL: Record<CharterField, string> = {
    purpose: "Purpose",
    objectives: "Objectives",
    scope_in: "In scope",
    scope_out: "Out of scope",
    sponsor: "Sponsor",
    budget: "Summary budget",
    timeline: "Summary timeline",
    success: "Success measures",
  };
  const FIELD_ID: Record<CharterField, string> = {
    purpose: "charter-purpose",
    objectives: "charter-objectives",
    scope_in: "charter-scope-in",
    scope_out: "charter-scope-out",
    sponsor: "charter-sponsor",
    budget: "charter-budget",
    timeline: "charter-timeline",
    success: "charter-success",
  };

  async function saveSection() {
    await save();
    setEditingKey(null);
  }

  function cancelSection(k: CharterField) {
    setDraft((d) => ({ ...d, [k]: charter[k] ?? "" }));
    setEditingKey(null);
  }

  const sectionEl = (f: (typeof FIELD_ROWS)[number]) => {
    const value = (charter[f.key] ?? "").trim();
    if (editingKey === f.key) {
      return (
        <div key={f.key} className="charter-field">
          {fieldEl(f, FIELD_ID[f.key])}
          {f.key === "objectives" && <p className="charter-hint">One per line.</p>}
          <div className="charter-section-actions no-print">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={saveSection}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => cancelSection(f.key)}>
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <section key={f.key} className="charter-section">
        <div className="charter-section-head">
          <h3>{DOC_LABEL[f.key]}</h3>
          {isOwner && (
            <button type="button" className="btn-link no-print" onClick={() => setEditingKey(f.key)}>
              {value ? "Edit" : "Add"}
            </button>
          )}
        </div>
        {value ? (
          f.key === "objectives" ? (
            <ul className="charter-objectives-list">
              {objectiveLines(charter[f.key]).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="charter-prose">{charter[f.key]}</p>
          )
        ) : (
          <p className="muted charter-unwritten">Not written yet.</p>
        )}
        {f.key === "objectives" && value && isOwner && okrsVisible && (
          <div className="charter-goals no-print">
            <button type="button" className="btn btn-primary" disabled={makingGoals} onClick={turnIntoGoals}>
              {makingGoals ? "Adding..." : "Turn these into goals"}
            </button>
            {goalsMsg && (
              <span className="muted" role="status">
                {goalsMsg}{" "}
                <button type="button" className="view-banner-link" onClick={() => onOpenTab("okrs")}>Open OKRs</button>
              </span>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="charter">
      <div className="charter-head">
        <h2>Charter</h2>
        <div className="charter-head-actions no-print">
          <span className={complete ? "pill pill-green" : "pill pill-gold"}>{complete ? "Complete" : "Draft"}</span>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      <p className="charter-print-title">{projectName}</p>

      {!isOwner && <p className="muted">Only the project owner can edit the charter.</p>}

      <div className="settings-card charter-card charter-doc">
        {sectionEl(byKey("purpose"))}
        {sectionEl(byKey("objectives"))}
        <div className="charter-row">
          {sectionEl(byKey("scope_in"))}
          {sectionEl(byKey("scope_out"))}
        </div>
        <div className="charter-row">
          {sectionEl(byKey("sponsor"))}
          {isShown("budget") && sectionEl(byKey("budget"))}
          {isShown("timeline") && sectionEl(byKey("timeline"))}
        </div>
        {isShown("success") && sectionEl(byKey("success"))}

        <p className="muted charter-doc-foot">
          Assumptions and constraints live in the{" "}
          <button type="button" className="view-banner-link no-print" onClick={() => onOpenTab("assumptions")}>
            Assumptions register
          </button>
          , so they stay checkable while the project runs.
        </p>

        {isOwner && !editingKey && dirty && (
          <div className="charter-save no-print">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save charter"}
            </button>
            <span className="muted">Unsaved changes</span>
          </div>
        )}
        {savedAt && !dirty && (
          <p className="muted" role="status" style={{ marginBottom: 0 }}>Saved</p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>


      <div className="settings-card charter-approval no-print">
        <p className="settings-card-label">Approval</p>
        <p className="muted">Optional. Turns the charter into a Decision your sponsor can approve or ask to change, from a link. Nothing is blocked either way.</p>
        <p className="charter-approval-status">
          <span className={`charter-dot charter-dot-${approval?.status ?? "none"}`} />
          {!approval && "Not requested yet"}
          {approval?.status === "pending" && "Waiting on your sponsor"}
          {approval?.status === "approved" && `Approved by ${approval.responderName} on ${fmtDate(approval.respondedAt)}`}
          {approval?.status === "changes_requested" && `${approval.responderName} asked for changes on ${fmtDate(approval.respondedAt)}`}
        </p>
        {approval?.outdated && <p className="muted">The charter has changed since this was sent.</p>}
        {approval && approval.status === "pending" && (
          <p className="charter-link">
            <code>{window.location.origin}/d/{approval.publicToken}</code>{" "}
            <button type="button" className="btn btn-ghost" onClick={() => copyLink(approval.publicToken)}>{copied ? "Copied" : "Copy link"}</button>
          </p>
        )}
        {isOwner && (!approval || approval.status !== "pending" || approval.outdated) && (
          <div>
            <button type="button" className="btn btn-ghost" disabled={asking || dirty || !charter.purpose} onClick={askForApproval}>
              {asking ? "Sending..." : approval ? "Send updated version" : "Ask for approval"}
            </button>
            {dirty && <span className="muted"> Save your changes first.</span>}
            {!dirty && !charter.purpose && <span className="muted"> Write the purpose first.</span>}
          </div>
        )}
        {approvalError && <p className="form-error">{approvalError}</p>}
      </div>

      <div className="no-print" style={{ marginTop: 16 }}>
        <HowItWorks label="How the charter is used">
          The purpose shows at the top of Home. While the project is in Initiate, writing the charter
          sits in the Next up list. Objectives can become OKRs in one click, from the Objectives
          section above.
        </HowItWorks>
      </div>

      {size === "light" && !showAll && (
        <p className="muted charter-note no-print">
          Light projects show Purpose, Objectives, Scope and Sponsor. Budget, timeline and success measures appear when the project grows to Standard.
        </p>
      )}
    </div>
  );
}
