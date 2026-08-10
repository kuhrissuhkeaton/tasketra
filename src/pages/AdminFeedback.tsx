import { useEffect, useState } from "react";
import { api, type Feedback } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";

const STATUS_PILL: Record<Feedback["status"], string> = {
  new: "pill-gold",
  planned: "pill-navy",
  shipped: "pill-green",
  dismissed: "pill-red",
};

export default function AdminFeedback() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { items } = await api.listFeedback();
      setItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load feedback.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: Feedback["status"]) {
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    await api.updateFeedback(id, { status });
  }

  async function saveNote(id: string, adminNote: string) {
    await api.updateFeedback(id, { adminNote });
  }

  async function notify(id: string) {
    setNotifying(id);
    try {
      await api.notifyFeedbackSubmitter(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that notification.");
    } finally {
      setNotifying(null);
    }
  }

  const counts = {
    new: items.filter((f) => f.status === "new").length,
    planned: items.filter((f) => f.status === "planned").length,
    shipped: items.filter((f) => f.status === "shipped").length,
  };

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Feedback</h1>
          <div className="stat-row">
            <div className="stat"><strong>{counts.new}</strong> new</div>
            <div className="stat"><strong>{counts.planned}</strong> planned</div>
            <div className="stat"><strong>{counts.shipped}</strong> shipped</div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : items.length === 0 ? (
          <p className="muted">No feedback yet -- the in-app Feedback link sends here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((f) => (
              <div key={f.id} className="project-card" style={{ cursor: "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", flex: 1 }}>{f.message}</p>
                  <span className={`pill ${STATUS_PILL[f.status]}`}>{f.status}</span>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                  {f.submitter_email} {f.page_path ? `-- ${f.page_path}` : ""} -- {new Date(f.created_at).toLocaleDateString()}
                </p>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                  <select value={f.status} onChange={(e) => setStatus(f.id, e.target.value as Feedback["status"])} style={{ width: "auto" }}>
                    <option value="new">New</option>
                    <option value="planned">Planned</option>
                    <option value="shipped">Shipped</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Internal note (optional)"
                    defaultValue={f.admin_note ?? ""}
                    onBlur={(e) => saveNote(f.id, e.target.value)}
                    style={{ flex: 1, minWidth: 180, marginBottom: 0 }}
                  />
                  {f.notified_at ? (
                    <span className="muted" style={{ fontSize: 13 }}>Notified {new Date(f.notified_at).toLocaleDateString()}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-link"
                      disabled={notifying === f.id}
                      onClick={() => notify(f.id)}
                    >
                      {notifying === f.id ? "Sending..." : "Notify submitter"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
