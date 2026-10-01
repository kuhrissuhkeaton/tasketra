import { useEffect, useState } from "react";
import { Drawer } from "./ItemDrawer";
import { api, type Project, type TemplatePlanSummary } from "../lib/api";
import { PROJECT_TEMPLATES } from "../lib/projectTemplates";

const CATEGORY_LABEL: [keyof Omit<TemplatePlanSummary, "totalToAdd">, string][] = [
  ["phases", "Phases"],
  ["milestones", "Milestones"],
  ["tasks", "Tasks"],
  ["risks", "Risks"],
  ["assumptions", "Assumptions"],
  ["stakeholders", "Stakeholder roles"],
];

/** Adds a template's skeleton to a project that already has work. Shows a
 *  preview first; nothing is written until the owner confirms. Pass projectId
 *  and/or templateId to fix that choice, or leave them out to pick here. */
export function ApplyTemplateDrawer({
  open, onClose, projectId, templateId, onApplied,
}: { open: boolean; onClose: () => void; projectId?: string; templateId?: string; onApplied?: () => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pickedProject, setPickedProject] = useState(projectId ?? "");
  const [pickedTemplate, setPickedTemplate] = useState(templateId ?? "");
  const [summary, setSummary] = useState<TemplatePlanSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<TemplatePlanSummary | null>(null);

  // Reset whenever it is opened again.
  useEffect(() => {
    if (!open) return;
    setPickedProject(projectId ?? "");
    setPickedTemplate(templateId ?? "");
    setSummary(null);
    setDone(null);
    setError("");
  }, [open, projectId, templateId]);

  // Only projects you own can take a template.
  useEffect(() => {
    if (!open || projectId) return;
    api.listProjects().then(({ projects }) => {
      const owned = projects.filter((p) => p.is_owner !== false);
      setProjects(owned);
      setPickedProject((cur) => cur || owned[0]?.id || "");
    }).catch(() => setProjects([]));
  }, [open, projectId]);

  // Preview whenever both choices are made.
  useEffect(() => {
    if (!open || !pickedProject || !pickedTemplate) { setSummary(null); return; }
    let cancelled = false;
    setBusy(true);
    setError("");
    api.applyTemplateToProject(pickedProject, pickedTemplate, true)
      .then((r) => { if (!cancelled) setSummary(r.summary); })
      .catch((e) => { if (!cancelled) { setSummary(null); setError(e.message || "Couldn't build the preview."); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, pickedProject, pickedTemplate]);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const r = await api.applyTemplateToProject(pickedProject, pickedTemplate, false);
      setDone(r.summary);
      onApplied?.();
    } catch (e: any) {
      setError(e.message || "Couldn't add the template.");
    } finally {
      setBusy(false);
    }
  }

  const template = PROJECT_TEMPLATES.find((t) => t.id === pickedTemplate);

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Template" title={template ? `Add "${template.name}"` : "Add from a template"}>
      {done ? (
        <div>
          <p><strong>Added {done.totalToAdd} {done.totalToAdd === 1 ? "item" : "items"}.</strong> Find them on the Roadmap, Tasks, Risks, Assumptions and Stakeholders tabs.</p>
          <p className="muted" style={{ fontSize: 13 }}>Everything can be edited or deleted. Deleted items go to Trash.</p>
          <button className="btn btn-primary" type="button" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="apply-tpl">
          <p className="muted" style={{ fontSize: 13 }}>
            Adds the template's phases, milestones, tasks, risks, assumptions and stakeholder roles alongside what
            you already have. Anything with the same title as something you already have is skipped, and nothing you
            have is changed. Dates are counted from today.
          </p>

          {!projectId && (
            <label className="forms-pick">
              <span className="muted">Project</span>
              {projects === null ? (
                <span className="muted">Loading...</span>
              ) : projects.length === 0 ? (
                <span className="muted">You don't own a project yet.</span>
              ) : (
                <select value={pickedProject} onChange={(e) => setPickedProject(e.target.value)} aria-label="Project">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </label>
          )}
          {!templateId && (
            <label className="forms-pick">
              <span className="muted">Template</span>
              <select value={pickedTemplate} onChange={(e) => setPickedTemplate(e.target.value)} aria-label="Template">
                <option value="">Choose a template</option>
                {PROJECT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}
          {busy && !summary && <p className="muted">Checking what would be added...</p>}

          {summary && (
            <>
              <table className="apply-tpl-table">
                <thead><tr><th>Kind</th><th>Will add</th><th>Already there</th></tr></thead>
                <tbody>
                  {CATEGORY_LABEL.map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{summary[key].add.length}</td>
                      <td className="muted">{summary[key].skip.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.totalToAdd > 0 && (
                <details className="template-details">
                  <summary>See what will be added</summary>
                  {CATEGORY_LABEL.filter(([key]) => summary[key].add.length > 0).map(([key, label]) => (
                    <div key={key}>
                      <h5>{label}</h5>
                      <ul>{summary[key].add.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  ))}
                </details>
              )}
              {summary.totalToAdd === 0 ? (
                <p className="muted">This project already has everything in this template, so there is nothing to add.</p>
              ) : (
                <div className="apply-tpl-actions">
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={apply}>
                    {busy ? "Adding..." : `Add ${summary.totalToAdd} ${summary.totalToAdd === 1 ? "item" : "items"}`}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
