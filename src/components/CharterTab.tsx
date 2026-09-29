import { useEffect, useState } from "react";
import { api } from "../lib/api";
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

      <div className="settings-card charter-card">
        {fieldEl(byKey("purpose"), "charter-purpose")}
        <div className="charter-field">
          <label htmlFor="charter-objectives">Objectives</label>
          <textarea id="charter-objectives" rows={3} value={draft.objectives ?? ""} disabled={!isOwner} onChange={(e) => set("objectives", e.target.value)} />
          <p className="charter-hint">One per line.</p>
          {isOwner && okrsVisible && objectiveLines(draft.objectives).length > 0 && (
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
        </div>
        <div className="charter-row">
          {fieldEl(byKey("scope_in"), "charter-scope-in")}
          {fieldEl(byKey("scope_out"), "charter-scope-out")}
        </div>
        <div className="charter-row">
          {fieldEl(byKey("sponsor"), "charter-sponsor")}
          {isShown("budget") && fieldEl(byKey("budget"), "charter-budget")}
          {isShown("timeline") && fieldEl(byKey("timeline"), "charter-timeline")}
        </div>
        {isShown("success") && fieldEl(byKey("success"), "charter-success")}

        {isOwner && (
          <div className="charter-save no-print">
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
              {saving ? "Saving..." : "Save charter"}
            </button>
            {savedAt && !dirty && <span className="muted" role="status">Saved</span>}
            {dirty && !saving && <span className="muted">Unsaved changes</span>}
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="settings-card charter-where no-print">
        <p className="settings-card-label">Where this shows up</p>
        <p>Purpose at the top of Home</p>
        <p>"Write the charter" in the Next up list while you are in Initiate</p>
        {okrsVisible && <p>Objectives become OKRs in one click</p>}
      </div>

      {size === "light" && !showAll && (
        <p className="muted charter-note no-print">
          Light projects show Purpose, Objectives, Scope and Sponsor. Budget, timeline and success measures appear when the project grows to Standard.
        </p>
      )}
    </div>
  );
}
