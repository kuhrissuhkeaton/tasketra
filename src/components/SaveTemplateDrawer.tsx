import { useEffect, useState } from "react";
import { Drawer } from "./ItemDrawer";
import { useConfirm } from "./ConfirmDialog";
import { api, type UserTemplate, type UserTemplatePreview } from "../lib/api";

const COUNT_LABEL: [keyof UserTemplatePreview["counts"], string][] = [
  ["phases", "phases"], ["milestones", "milestones"], ["tasks", "tasks"], ["risks", "risks"], ["assumptions", "assumptions"],
];

/** Saves the project's skeleton as one of your own templates, and lists the
 *  ones you already have so you can delete them. Private to you. */
export function SaveTemplateDrawer({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const confirmDialog = useConfirm();
  const [preview, setPreview] = useState<UserTemplatePreview | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mine, setMine] = useState<UserTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ name: string; truncated: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null); setSaved(null); setError(""); setDescription("");
    api.previewUserTemplate(projectId)
      .then((p) => { setPreview(p); setName(p.suggestedName); })
      .catch((e) => setError(e.message || "Couldn't read this project."));
    api.listUserTemplates().then((r) => setMine(r.templates)).catch(() => setMine([]));
  }, [open, projectId]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await api.saveUserTemplate(projectId, name.trim(), description.trim());
      setSaved({ name: r.template.name, truncated: r.truncated });
      setMine((m) => [r.template, ...m]);
    } catch (e: any) {
      setError(e.message || "Couldn't save the template.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: UserTemplate) {
    if (!(await confirmDialog(`Delete your template "${t.name}"? Projects you already made from it are not affected.`))) return;
    try {
      await api.deleteUserTemplate(t.id);
      setMine((m) => m.filter((x) => x.id !== t.id));
    } catch (e: any) {
      setError(e.message || "Couldn't delete that template.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Template" title="Save as a template">
      <div className="apply-tpl">
        {saved ? (
          <p><strong>Saved "{saved.name}".</strong> It now appears under Your templates when you start a new project or choose Add from a template.
            {saved.truncated && " Very large projects are trimmed to the first items of each kind."}</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              Keeps this project's phases, milestones, tasks, risks and assumptions as titles and day counts, so you can start
              or top up other projects from it. Only you can see and use it. No people, emails, owners, notes or
              statuses are copied, and dates become "days from the start".
            </p>
            {preview && (
              <p>
                {preview.empty
                  ? "There is nothing to save yet. Add phases, tasks, risks or assumptions first."
                  : <>This will save <strong>{COUNT_LABEL.map(([k, l]) => `${preview.counts[k]} ${l}`).join(", ")}</strong>.</>}
                {preview.truncated && " Very large projects are trimmed to the first items of each kind."}
              </p>
            )}
            <label className="forms-pick">
              <span className="muted">Name</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
            </label>
            <label className="forms-pick">
              <span className="muted">What it is for (optional)</span>
              <textarea rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Template description" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="apply-tpl-actions">
              <button className="btn btn-primary" type="button" disabled={busy || !name.trim() || !preview || preview.empty} onClick={save}>
                {busy ? "Saving..." : "Save template"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {mine.length > 0 && (
          <>
            <h4 style={{ marginTop: 24 }}>Your templates ({mine.length})</h4>
            <ul className="my-templates">
              {mine.map((t) => (
                <li key={t.id}>
                  <div><strong>{t.name}</strong><div className="muted" style={{ fontSize: 12 }}>{t.summary}</div></div>
                  <button className="btn-link btn-link-danger" type="button" onClick={() => remove(t)}>Delete</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Drawer>
  );
}
