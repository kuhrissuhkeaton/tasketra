// Quality tab, extracted mechanically from ProjectHome.tsx in v153 (no
// behavior change) so the monolith shrinks one self-contained tab at a time.
import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { api, type QualityItem } from "../../lib/api";
import { RowActionsMenu } from "../../components/RowActionsMenu";
import { QuickAddForm } from "../../components/QuickAddForm";
import { useConfirm } from "../../components/ConfirmDialog";
import { RegisterRow, RegisterSummary, RegisterEmpty } from "../../components/ui";
import { announce } from "../../lib/announce";

const QUALITY_CATEGORY_LABEL: Record<QualityItem["category"], string> = {
  standard: "Standard",
  review: "Review",
  defect: "Defect",
};

const QUALITY_STATUS_LABEL: Record<QualityItem["status"], string> = {
  open: "Open",
  in_progress: "In review",
  passed: "Passed",
  failed: "Failed",
};

export function QualityTab({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<QualityItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<QualityItem["category"]>("review");
  const [owner, setOwner] = useState("");
  const [newStatus, setNewStatus] = useState<QualityItem["status"]>("open");
  const [view, setView] = useState<"list" | "board">("list");
  const [dragOverStatus, setDragOverStatus] = useState<QualityItem["status"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<QualityItem["category"]>("review");
  const [editOwner, setEditOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const { qualityItems } = await api.listQuality(projectId);
    setItems(qualityItems);
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
      await api.createQuality(projectId, title.trim(), description || undefined, category, owner || undefined, newStatus);
      setTitle("");
      setDescription("");
      setCategory("review");
      setOwner("");
      setNewStatus("open");
      announce("Quality item added.");
      load();
    } catch (err: any) {
      setError(err.message || "Couldn't log that quality item.");
    }
  }

  async function setStatus(id: string, status: QualityItem["status"]) {
    await api.updateQuality(id, { status });
    load();
  }

  function onDropOnColumn(e: DragEvent, status: QualityItem["status"]) {
    e.preventDefault();
    setDragOverStatus(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setStatus(itemId, status);
  }

  function startEdit(q: QualityItem) {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditDescription(q.description || "");
    setEditCategory(q.category);
    setEditOwner(q.owner_name || "");
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return;
    await api.updateQuality(id, {
      title: editTitle.trim(), description: editDescription || undefined, category: editCategory, owner_name: editOwner || undefined,
    } as any);
    setEditingId(null);
    load();
  }

  async function removeItem(id: string, label: string) {
    if (!(await confirmDialog(`Delete quality item "${label}"? You can restore it from Trash.`))) return;
    await api.deleteQuality(id);
    announce("Deleted.");
    load();
  }

  if (loading) return <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>;

  return (
    <div>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        Standards to meet, reviews to run, and defects you've found -- a quality log alongside
        the rest of RAID, since "is this good enough" is a different question from "is something
        broken."
      </p>
      <QuickAddForm
        storageKey="quality"
        hasRows={items.length > 0}
        startExpanded={false}
        onSubmit={addItem}
        quick={
          <>
            <label htmlFor="f-projecthome-2769" className="sr-only">Quality item</label>
            <input className="quick-add-title" aria-required="true" id="f-projecthome-2769" placeholder="What needs to meet a bar, or get reviewed?" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as QualityItem["category"])}>
              {Object.entries(QUALITY_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button className="btn btn-primary">Log quality item</button>
          </>
        }
        more={
          <>
            <label htmlFor="f-projecthome-2771">Description (optional)</label>
            <textarea id="f-projecthome-2771" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            <div className="inline-form" style={{ marginTop: 8, marginBottom: 0 }}>
              <input aria-label="Owner (optional)" placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as QualityItem["status"])} title="Status" aria-label="Status">
                {Object.entries(QUALITY_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
          {(Object.keys(QUALITY_STATUS_LABEL) as QualityItem["status"][]).map((status) => (
            <div
              key={status}
              className={dragOverStatus === status ? "kanban-column kanban-column-over" : "kanban-column"}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => onDropOnColumn(e, status)}
            >
              <div className="kanban-column-head">
                {QUALITY_STATUS_LABEL[status]}
                <span className="kanban-column-count">{items.filter((q) => q.status === status).length}</span>
              </div>
              {items.filter((q) => q.status === status).map((q) => (
                <div
                  key={q.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", q.id)}
                >
                  <span className="pill pill-navy" style={{ marginBottom: 6, display: "inline-block" }}>
                    {QUALITY_CATEGORY_LABEL[q.category]}
                  </span>
                  <div>{q.title}</div>
                  <div className="muted">{q.owner_name || "unassigned"}</div>
                </div>
              ))}
              {items.filter((q) => q.status === status).length === 0 && (
                <div className="muted kanban-empty">Drop quality items here</div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <>
      <RegisterSummary>
        {items.filter((q) => q.status === "open" || q.status === "in_progress").length} to do
        {" \u00b7 "}{items.filter((q) => q.status === "failed").length} failed
        {" \u00b7 "}{items.filter((q) => q.status === "passed").length} passed
      </RegisterSummary>
      {items.length === 0 ? (
        <RegisterEmpty>No quality items logged yet. Add a standard to meet, a review to run, or a defect you found.</RegisterEmpty>
      ) : (
        <ul className="rg-list" aria-label="Quality items">
          {items.map((q) => (
            editingId === q.id ? (
              <li key={q.id} className="rg-edit">
                <div className="rg-edit-fields">
                  <input aria-label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <textarea aria-label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" />
                  <select aria-label="Category" value={editCategory} onChange={(e) => setEditCategory(e.target.value as QualityItem["category"])}>
                    {Object.entries(QUALITY_CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input aria-label="Owner" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} />
                </div>
                <div className="rg-edit-actions">
                  <span className="muted">{QUALITY_STATUS_LABEL[q.status]}</span>
                  <button className="btn btn-primary" type="button" onClick={() => saveEdit(q.id)}>Save</button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </li>
            ) : (
              <RegisterRow
                key={q.id}
                title={q.title}
                meta={<>{q.owner_name || "No owner"}{q.description ? ` \u00b7 ${q.description}` : ""}</>}
                pill={<span className="pill pill-navy">{QUALITY_CATEGORY_LABEL[q.category]}</span>}
                control={
                  <select aria-label="Status"
                    className={`status-select status-select-${q.status}`}
                    value={q.status}
                    onChange={(e) => setStatus(q.id, e.target.value as QualityItem["status"])}
                  >
                    {Object.entries(QUALITY_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                }
                actions={
                  <>
                    <button className="btn-link" type="button" onClick={() => startEdit(q)}>Edit</button>
                    <RowActionsMenu
                      label={`More actions for ${q.title}`}
                      items={[{ label: "Delete", danger: true, onSelect: () => removeItem(q.id, q.title) }]}
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
