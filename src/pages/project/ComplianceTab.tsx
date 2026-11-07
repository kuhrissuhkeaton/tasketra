// Compliance tab, extracted mechanically from ProjectHome.tsx in v153 (no
// behavior change) so the monolith shrinks one self-contained tab at a time.
import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { api, type ComplianceItem } from "../../lib/api";
import { RowActionsMenu } from "../../components/RowActionsMenu";
import { QuickAddForm } from "../../components/QuickAddForm";
import { useConfirm } from "../../components/ConfirmDialog";
import { RegisterRow, RegisterSummary, RegisterEmpty } from "../../components/ui";
import { announce } from "../../lib/announce";
import { fmtLocalDate } from "../../lib/format";
import { expiryFlag } from "../../lib/rowFlags";

const COMPLIANCE_CATEGORY_LABEL: Record<ComplianceItem["category"], string> = {
  regulatory: "Regulatory",
  policy: "Policy",
  standard: "Standard",
  contractual: "Contractual",
};

const COMPLIANCE_STATUS_LABEL: Record<ComplianceItem["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  compliant: "Compliant",
  non_compliant: "Non-compliant",
};

export function ComplianceTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComplianceItem["category"]>("regulatory");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<ComplianceItem["status"]>("not_started");
  const [dueDate, setDueDate] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<ComplianceItem["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<ComplianceItem["category"]>("regulatory");
  const [editOwner, setEditOwner] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const { complianceItems } = await api.listCompliance(projectId);
    setItems(complianceItems);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [projectId]);

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError("");
    try {
      await api.createCompliance(projectId, title.trim(), description || undefined, category, owner || undefined, newStatus, dueDate || undefined);
      setTitle("");
      setDescription("");
      setCategory("regulatory");
      setOwner("");
      setNewStatus("not_started");
      setDueDate("");
      announce("Compliance item added.");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that compliance item.");
    }
  }

  async function setStatus(id: string, status: ComplianceItem["status"]) {
    await api.updateCompliance(id, { status });
    load();
  }

  function onDropOnColumn(e: DragEvent, status: ComplianceItem["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setStatus(itemId, status);
  }

  function startEdit(c: ComplianceItem) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditDescription(c.description || "");
    setEditCategory(c.category);
    setEditOwner(c.owner_name || "");
    setEditDueDate(c.due_date || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateCompliance(id, {
      title: editTitle.trim(), description: editDescription || undefined, category: editCategory,
      owner_name: editOwner || undefined, due_date: editDueDate || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Delete compliance item "${label}"? You can restore it from Trash.`))) return;
    await api.deleteCompliance(id);
    announce("Deleted.");
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Regulatory, policy, standard, or contractual obligations this project needs to satisfy --
        tracked alongside the rest of RAID, since "are we compliant with this" is a different
        question from "is this good enough" (Quality) or "is something broken" (Issues).
      </p>
      <QuickAddForm
        storageKey="compliance"
        hasRows={items.length > 0}
        startExpanded={false}
        onSubmit={addItem}
        quick={
          <>
            <label htmlFor="f-projecthome-3013" className="sr-only">Compliance item</label>
            <input className="quick-add-title" aria-required="true" id="f-projecthome-3013" placeholder="What regulation, policy, or standard applies here?" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as ComplianceItem["category"])}>
              {Object.entries(COMPLIANCE_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button className="btn btn-primary">Log compliance item</button>
          </>
        }
        more={
          <>
            <label htmlFor="f-projecthome-3015">Description (optional)</label>
            <textarea id="f-projecthome-3015" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
              <input aria-label="Owner (optional)" placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ComplianceItem["status"])} title="Status" aria-label="Status">
                {Object.entries(COMPLIANCE_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input type="date" title="Due date (optional)" aria-label="Due date (optional)" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </>
        }
      />
      {error && <p className="form-error">{error}</p>}

      <div className="view-toggle">
        <button
          className={view === "list" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          className={view === "board" ? "btn btn-primary" : "btn btn-ghost"}
          type="button"
          onClick={() => setView("board")}
        >
          Board
        </button>
      </div>

      {view === "board" ? (
        <div className="kanban-board">
          {(Object.keys(COMPLIANCE_STATUS_LABEL) as ComplianceItem["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {COMPLIANCE_STATUS_LABEL[status]}
                <span className="kanban-column-count">{items.filter((c) => c.status === status).length}</span>
              </div>
              {items.filter((c) => c.status === status).map((c) => (
                <div
                  key={c.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {COMPLIANCE_CATEGORY_LABEL[c.category]}
                  </span>
                  <div>{c.title}</div>
                  <div className="muted">{c.owner_name || "unassigned"}{c.due_date ? ` -- due ${fmtLocalDate(c.due_date)}` : ""}</div>
                </div>
              ))}
              {items.filter((c) => c.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop compliance items here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <>
      <RegisterSummary>
        {items.filter((c) => c.status === "not_started" || c.status === "in_progress").length} to do
        {" \u00b7 "}{items.filter((c) => c.status === "non_compliant").length} non-compliant
        {" \u00b7 "}{items.filter((c) => c.status === "compliant").length} compliant
      </RegisterSummary>
      {items.length === 0 ? (
        <RegisterEmpty>No compliance items logged yet. Add a regulation, policy, or standard this project needs to satisfy.</RegisterEmpty>
      ) : (
        <ul className="rg-list" aria-label="Compliance items">
          {items.map((c) => (
            editingId === c.id ? (
              <li key={c.id} className="rg-edit">
                <div className="rg-edit-fields">
                  <input aria-label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <textarea aria-label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                  <select aria-label="Category" value={editCategory} onChange={(e) => setEditCategory(e.target.value as ComplianceItem["category"])}>
                    {Object.entries(COMPLIANCE_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input aria-label="Owner" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} />
                  <input aria-label="Due date" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                </div>
                <div className="rg-edit-actions">
                  <span className="muted">{COMPLIANCE_STATUS_LABEL[c.status]}</span>
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </li>
            ) : (
              <RegisterRow
                key={c.id}
                title={c.title}
                meta={<>{c.owner_name || "No owner"}{c.description ? ` \u00b7 ${c.description}` : ""}</>}
                pill={<span className="pill pill-navy">{COMPLIANCE_CATEGORY_LABEL[c.category]}</span>}
                flag={expiryFlag(c.due_date, c.status !== "compliant")}
                date={c.due_date ? fmtLocalDate(c.due_date) : null}
                dateLabel="Due"
                control={
                  <select aria-label="Status"
                    className={`status-select status-select-${c.status}`}
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value as ComplianceItem["status"])}
                  >
                    {Object.entries(COMPLIANCE_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                }
                actions={
                  <>
                    <button className="btn-link" type="button" onClick={() => startEdit(c)}>Edit</button>
                    <RowActionsMenu
                      label={`More actions for ${c.title}`}
                      items={[{ label: "Delete", danger: true, onSelect: () => removeItem(c.id, c.title) }]}
                    />
                  </>
                }
              />
            )
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  );
}

