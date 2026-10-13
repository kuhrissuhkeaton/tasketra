import { useEffect, useState } from "react";
import { api, type WaitlistSignup } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { useConfirm } from "../components/ConfirmDialog";
import { PageHeader, RegisterRow, RegisterSummary, RegisterEmpty } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useDocumentTitle } from "../lib/documentTitle";

export default function AdminWaitlist() {
  useDocumentTitle("Waitlist");
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

      <main id="main-content" className="project-main">
        <PageHeader title="Waitlist" subtitle="People who asked for an invite." />
        <RegisterSummary>
          {signups.filter((s) => s.status === "pending").length} pending · {signups.filter((s) => s.status === "invited").length} invited
        </RegisterSummary>

        {error && <div className="form-error">{error}</div>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : signups.length === 0 ? (
          <RegisterEmpty>No one's signed up yet.</RegisterEmpty>
        ) : (
          <ul className="rg-list" aria-label="Waitlist signups">
            {signups.map((s) => (
              <RegisterRow
                key={s.id}
                title={s.email}
                pill={<span className={`pill ${s.status === "invited" ? "pill-green" : "pill-gold"}`}>{s.status}</span>}
                date={fmtDate(s.created_at)}
                dateLabel="Joined"
                actions={
                  <>
                    {s.status === "pending" && (
                      <button className="btn-link" type="button" onClick={() => markInvited(s.id)}>Mark invited</button>
                    )}
                    <button className="btn-link btn-link-danger" type="button" onClick={() => remove(s.id, s.email)}>Remove</button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
