import { useEffect, useState } from "react";
import { api, type FoundingMember } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";

export default function AdminFoundingMembers() {
  const [members, setMembers] = useState<FoundingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { members } = await api.listFoundingMembers();
      setMembers(members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load founding members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Founding members</h1>
          <div className="stat-row">
            <div className="stat"><strong>{members.length}</strong> of 100 spots claimed</div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : members.length === 0 ? (
          <p className="muted">No founding members yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Job title</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.display_name || <span className="muted">—</span>}</td>
                  <td>{m.email}</td>
                  <td>{m.job_title || <span className="muted">—</span>}</td>
                  <td className="muted">{new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
