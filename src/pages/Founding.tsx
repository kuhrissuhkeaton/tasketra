import { useEffect, useState } from "react";
import { PageHeader, SoftCard, RegisterRow } from "../components/ui";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../lib/auth-context";
import { api, type FoundingMe, type FoundingWallMember, type ReferralInfo } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useDocumentTitle } from "../lib/documentTitle";

export default function Founding() {
  useDocumentTitle("Founder hub");
  const { user } = useAuth();
  const isFounder = user?.plan === "founding";
  const [me, setMe] = useState<FoundingMe | null>(null);
  const [referrals, setReferrals] = useState<ReferralInfo | null>(null);
  const [wall, setWall] = useState<FoundingWallMember[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isFounder) return;
    api.getFoundingMe().then(setMe).catch(() => setError("Couldn't load your founding details."));
    api.getReferrals().then(setReferrals).catch(() => {});
    api.getFoundingWall().then((r) => setWall(r.members)).catch(() => {});
  }, [isFounder]);

  function copyLink() {
    if (!referrals) return;
    navigator.clipboard.writeText(referrals.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function toggleWall(next: boolean) {
    setBusy(true);
    setError("");
    try {
      setMe(await api.setFoundingWallOptIn(next));
      const r = await api.getFoundingWall();
      setWall(r.members);
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  if (!isFounder) {
    return (
      <div className="project-shell">
        <AppSidebar />
        <main id="main-content" className="project-main">
          <PageHeader title="Founder hub" subtitle="This page is for founding members." />
        </main>
      </div>
    );
  }

  return (
    <div className="project-shell">
      <AppSidebar />
      <main id="main-content" className="project-main">
        <PageHeader title="Founder hub" subtitle="Your founding badge, your referral link, and the founders' wall." />
        {error && <p className="form-error" role="alert">{error}</p>}

        <SoftCard title="Your badge" className="ui-narrow billing-card">
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0" }}>
            Founding Member{me?.number ? ` #${me.number}` : ""}
          </p>
          <p className="muted" style={{ marginTop: 0 }}>
            {me?.number ? `One of the first ${me.cap} people on Tasketra. ` : ""}
            {me?.since ? `Member since ${fmtDate(me.since)}. ` : ""}
            Pro is free for you, forever.
          </p>
        </SoftCard>

        <SoftCard title="Bring someone along" className="ui-narrow billing-card">
          <p className="muted" style={{ marginTop: 0 }}>
            Know a project manager who'd use Tasketra? Share your link. You already have Pro free forever, so there's no credit to earn. This is just the easiest way to bring a colleague with you.
          </p>
          {referrals && (
            <>
              <div className="inline-form">
                <input aria-label="Your referral link" type="text" readOnly value={referrals.link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 260 }} />
                <button type="button" className="btn btn-primary" onClick={copyLink}>
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
              <div className="stat-row" style={{ marginTop: 4 }}>
                <div className="stat"><strong>{referrals.totalReferred}</strong> joined</div>
              </div>
            </>
          )}
        </SoftCard>

        <SoftCard title="Founders' wall" className="ui-narrow billing-card">
          <p className="muted" style={{ marginTop: 0 }}>
            Optional. Show your name and number to other founding members. Only your display name is shown, never your email.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!me?.wallOptIn}
              disabled={busy || !me}
              onChange={(e) => toggleWall(e.target.checked)}
            />
            Show my name on the founders' wall
          </label>
          {me?.wallOptIn && !user.display_name && (
            <p className="muted">Add your name on the Account page so you appear on the wall.</p>
          )}
          {wall && wall.length > 0 && (
            <ul className="rg-list rg-plain" aria-label="Founders on the wall" style={{ marginTop: 12 }}>
              {wall.map((m) => (
                <RegisterRow key={m.number} title={<><strong>#{m.number}</strong> {m.name}</>} />
              ))}
            </ul>
          )}
          {wall && wall.length === 0 && <p className="muted">No one has joined the wall yet.</p>}
        </SoftCard>
      </main>
    </div>
  );
}
