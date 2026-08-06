import { useEffect, useState } from "react";
import { api, type WaitlistSignup } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useConfirm } from "../components/ConfirmDialog";

export default function AdminWaitlist() {
  const confirmDialog = useConfirm();
  const [signups, setSignups] = useState<WaitlistSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { signups } = await api.listWaitlist();
      setSignups(signups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the waitlist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markInvited(id: string) {
    await api.markWaitlistInvited(id);
    load();
  }

  async function remove(id: string, email: string) {
    if (!(await confirmDialog(`Remove ${email} from the waitlist?`))) return;
    await api.deleteWaitlistSignup(id);
    load();
  }

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Waitlist</h1>
          <div className="stat-row">
            <div className="stat"><strong>{signups.filter((s) => s.status === "pending").length}</strong> pending</div>
            <div className="stat"><strong>{signups.filter((s) => s.status === "invited").length}</strong> invited</div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : signups.length === 0 ? (
          <p className="muted">No one's signed up yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Email</th><th>Status</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td><span className={`pill ${s.status === "invited" ? "pill-green" : "pill-gold"}`}>{s.status}</span></td>
                  <td className="muted">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="row-actions">
                    {s.status === "pending" && (
                      <button className="btn-link" type="button" onClick={() => markInvited(s.id)}>Mark invited</button>
                    )}
                    <button className="btn-link btn-link-danger" type="button" onClick={() => remove(s.id, s.email)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
