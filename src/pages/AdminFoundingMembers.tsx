import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AccountRemovalPreview, type AdminAccount, type AdminAccountsSummary } from "../lib/api";
import { AppSidebar } from "../components/AppSidebar";
import { ResizableTable } from "../components/ResizableTable";
import { fmtDate } from "../lib/format";

type Removal = { account: AdminAccount; mode: "founding" | "delete" };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function AdminFoundingMembers() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [summary, setSummary] = useState<AdminAccountsSummary | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.adminListAccounts(showAll ? "all" : "founding");
      setAccounts(data.accounts);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="project-shell">
      <AppSidebar />

      <main className="project-main">
        <div className="page-head">
          <h1>Founding members</h1>
          {summary && (
            <div className="stat-row">
              <div className="stat"><strong>{summary.foundingClaimed}</strong> of {summary.cap} spots claimed</div>
            </div>
          )}
        </div>

        <p className="muted" style={{ maxWidth: 640 }}>
          Remove a test or duplicate account here. "Remove founding status" keeps the account but gives the spot back;
          "Delete account" removes the account and everything it owns.
        </p>

        <p><Link className="btn btn-ghost" to="/admin/email-founding-members">Email all founding members</Link></p>

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all accounts{summary ? ` (${summary.totalAccounts})` : ""}, not just founding members
        </label>

        {error && <div className="form-error">{error}</div>}
        {notice && <p className="form-success" role="status">{notice}</p>}

        {loading ? (
          <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
        ) : accounts.length === 0 ? (
          <p className="muted">{showAll ? "No accounts yet." : "No founding members yet."}</p>
        ) : (
          <ResizableTable id="admin-accounts" minColWidths={[260, 90, 110, 0, 220]}>
            <thead>
              <tr><th>Account</th><th>Projects</th><th>Joined</th><th>Plan</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div>{a.display_name || <span className="muted">No name</span>}{a.job_title ? <span className="muted"> · {a.job_title}</span> : null}</div>
                    <div className="muted" style={{ wordBreak: "break-all" }}>{a.email}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {a.is_you && <span className="pill pill-navy">You</span>}
                      {a.possible_duplicates.length > 0 && (
                        <span className="pill pill-gold" title={`Same mailbox as: ${a.possible_duplicates.join(", ")}`}>
                          Possible duplicate of {a.possible_duplicates.join(", ")}
                        </span>
                      )}
                      {a.project_count === 0 && <span className="pill">No projects</span>}
                      {!a.email_verified && <span className="pill">Email not verified</span>}
                    </div>
                  </td>
                  <td>{a.project_count}</td>
                  <td className="muted">{fmtDate(a.created_at)}</td>
                  <td>
                    {a.founding_member ? <span className="pill pill-green">Founding</span> : <span className="muted">{a.subscription_status ? `Pro (${a.subscription_status})` : "Free"}</span>}
                  </td>
                  <td>
                    {a.is_you ? (
                      <span className="muted">Your account</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        {a.founding_member && (
                          <button type="button" className="btn-link" onClick={() => { setNotice(null); setRemoval({ account: a, mode: "founding" }); }}>
                            Remove founding status
                          </button>
                        )}
                        <button type="button" className="btn-link btn-link-danger" onClick={() => { setNotice(null); setRemoval({ account: a, mode: "delete" }); }}>
                          Delete account
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResizableTable>
        )}
      </main>

      {removal && (
        <RemovalDialog
          removal={removal}
          onClose={() => setRemoval(null)}
          onDone={(message) => {
            setRemoval(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </div>
  );
}

function RemovalDialog({ removal, onClose, onDone }: { removal: Removal; onClose: () => void; onDone: (message: string) => void }) {
  const { account, mode } = removal;
  const [preview, setPreview] = useState<AccountRemovalPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "delete") return;
    let cancelled = false;
    api.adminPreviewRemoval(account.id)
      .then((r) => { if (!cancelled) setPreview(r.preview); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not check this account."); });
    return () => { cancelled = true; };
  }, [account.id, mode]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const blocked = !!preview && preview.blockers.length > 0;
  const emailMatches = typed.trim().toLowerCase() === account.email.toLowerCase();
  const canConfirm = mode === "founding" ? !busy : !busy && !!preview && !blocked && emailMatches;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "founding") {
        await api.adminRemoveFounding(account.id);
        onDone(`Removed the founding spot from ${account.email}. The account is still there.`);
      } else {
        await api.adminDeleteAccount(account.id, typed);
        onDone(`Deleted ${account.email}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <div className="confirm-overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="removal-title" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <p className="confirm-message" id="removal-title" style={{ fontWeight: 600 }}>
          {mode === "founding" ? "Remove founding status?" : "Delete this account?"}
        </p>
        <p className="muted" style={{ wordBreak: "break-all" }}>{account.email}</p>

        {mode === "founding" ? (
          <p>
            This account keeps working and keeps its data, but it becomes a Free account and the founding spot opens up
            again{account.project_count > 3 ? `. It owns ${plural(account.project_count, "project")}, so it can't create new ones until it has 3 or fewer or upgrades` : ""}.
          </p>
        ) : !preview && !error ? (
          <p className="muted">Checking what this would remove...</p>
        ) : preview ? (
          <>
            <p>
              This permanently deletes the account and {plural(preview.projects, "project")} with{" "}
              {plural(preview.documents, "uploaded file")}, plus its membership in other people's projects. It can't be undone.
              {account.founding_member ? " Its founding spot opens up again." : ""}
            </p>
            {preview.blockers.length > 0 && (
              <ul className="form-error" style={{ margin: "8px 0", paddingLeft: 18 }}>
                {preview.blockers.map((b) => <li key={b.code}>{b.message}</li>)}
              </ul>
            )}
            {!blocked && (
              <>
                <label htmlFor="removal-confirm-email">Type the email address to confirm</label>
                <input
                  id="removal-confirm-email"
                  autoFocus
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={account.email}
                />
              </>
            )}
          </>
        ) : null}

        {error && <div className="form-error">{error}</div>}

        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} autoFocus={mode === "founding"}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={!canConfirm}>
            {busy ? "Working..." : mode === "founding" ? "Remove founding status" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
