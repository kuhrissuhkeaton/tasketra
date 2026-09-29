import { useEffect, useId, useState } from "react";
import { api } from "../lib/api";
import type { Tolerances, ToleranceKey } from "../lib/tolerances";

const FIELDS: { key: ToleranceKey; label: string; hint: string; step: string; placeholder: string }[] = [
  { key: "cpi_min", label: "Cost index (CPI) below", hint: "Needs a budget. 1.0 is on budget.", step: "0.01", placeholder: "0.9" },
  { key: "spi_min", label: "Schedule index (SPI) below", hint: "1.0 is on schedule.", step: "0.01", placeholder: "0.9" },
  { key: "overdue_max", label: "More overdue tasks than", hint: "Flags when the count goes over this.", step: "1", placeholder: "3" },
  { key: "high_risks_max", label: "More high risks than", hint: "Open risks rated high on probability or impact.", step: "1", placeholder: "2" },
];

type Draft = Record<ToleranceKey, string>;

const toDraft = (t: Tolerances | undefined): Draft => ({
  cpi_min: t?.cpi_min !== undefined ? String(t.cpi_min) : "",
  spi_min: t?.spi_min !== undefined ? String(t.spi_min) : "",
  overdue_max: t?.overdue_max !== undefined ? String(t.overdue_max) : "",
  high_risks_max: t?.high_risks_max !== undefined ? String(t.high_risks_max) : "",
});

/**
 * Optional escalation thresholds. Leave a box blank and that limit is off.
 * When a limit is crossed the project shows "Needs escalation" on Home and the
 * Dashboard. It only raises a flag, and nothing is ever blocked.
 */
export function EscalationSettings({
  projectId, tolerances, onSaved,
}: {
  projectId: string;
  tolerances: Tolerances | undefined;
  onSaved: (t: Tolerances) => void;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(toDraft(tolerances));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(toDraft(tolerances));
  }, [tolerances]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(tolerances));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body: Tolerances = {};
      for (const f of FIELDS) {
        const raw = draft[f.key].trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label}: enter a number, or leave it blank.`);
        body[f.key] = n;
      }
      const { project } = await api.updateProject(projectId, { tolerances: body });
      onSaved(project.tolerances ?? body);
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Couldn't save the thresholds.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-card">
      <p className="settings-card-label">Escalation thresholds</p>
      <p className="muted" style={{ marginBottom: 14 }}>
        Optional. Set a limit and this project shows "Needs escalation" on Home and the Dashboard when it is crossed. Leave a box blank to turn that limit off. Nothing is ever blocked.
      </p>
      <div className="tolerance-grid">
        {FIELDS.map((f) => (
          <div key={f.key} className="tolerance-field">
            <label htmlFor={`${uid}-${f.key}`}>{f.label}</label>
            <input
              id={`${uid}-${f.key}`}
              type="number"
              min="0"
              step={f.step}
              inputMode="decimal"
              placeholder={f.placeholder}
              value={draft[f.key]}
              onChange={(e) => { setDraft((d) => ({ ...d, [f.key]: e.target.value })); setSaved(false); }}
            />
            <span className="tolerance-hint">{f.hint}</span>
          </div>
        ))}
      </div>
      <div className="charter-save">
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving..." : "Save thresholds"}
        </button>
        {saved && !dirty && <span className="muted" role="status">Saved</span>}
        {dirty && !saving && <span className="muted">Unsaved changes</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
