import { useEffect, useRef, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { useAuth } from "../lib/auth-context";
import { api, type ReferralInfo } from "../lib/api";
import { avatarColor, initials } from "../lib/avatar";

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

export default function Account() {
  const { user, refresh } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [jobTitle, setJobTitle] = useState(user?.job_title || "");
  const [timezone, setTimezone] = useState(user?.timezone || "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0); // bumped to force <img> reload after change

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [referrals, setReferrals] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || "");
    setJobTitle(user?.job_title || "");
    setTimezone(user?.timezone || "");
  }, [user?.display_name, user?.job_title, user?.timezone]);

  useEffect(() => {
    api.getReferrals().then(setReferrals).catch(() => {});
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSaved(false);
    setProfileBusy(true);
    try {
      await api.updateProfile({ displayName, jobTitle, timezone });
      await refresh();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function onAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    setAvatarBusy(true);
    try {
      await api.uploadAvatar(file);
      await refresh();
      setAvatarVersion((v) => v + 1);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't upload that image.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError("");
    try {
      await api.deleteAvatar();
      await refresh();
      setAvatarVersion((v) => v + 1);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't remove that.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    setPasswordBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  function copyLink() {
    if (!referrals) return;
    navigator.clipboard.writeText(referrals.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!user) return null;

  return (
    <div className="project-shell">
      <AppSidebar />
      <main className="project-main">
        <div className="page-head">
          <h1>Account</h1>
        </div>

        <div className="settings-card" style={{ maxWidth: 640 }}>
          <p className="settings-card-label">Profile picture</p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {user.has_avatar ? (
              <img
                key={avatarVersion}
                src={`${api.avatarUrl(user.id)}&v=${avatarVersion}`}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                className="member-avatar"
                style={{ width: 64, height: 64, fontSize: 22, background: avatarColor(user.email) }}
              >
                {initials(user.display_name || user.email)}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" disabled={avatarBusy} onClick={() => fileInputRef.current?.click()}>
                {avatarBusy ? "Working..." : user.has_avatar ? "Change" : "Upload"}
              </button>
              {user.has_avatar && (
                <button type="button" className="btn-link btn-link-danger" disabled={avatarBusy} onClick={removeAvatar}>
                  Remove
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onAvatarSelected} />
            </div>
          </div>
          {avatarError && <div className="form-error">{avatarError}</div>}
        </div>

        <div className="settings-card" style={{ maxWidth: 640 }}>
          <p className="settings-card-label">Profile</p>
          <form onSubmit={saveProfile}>
            <label>Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={user.email} />
            <label>Job title</label>
            <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior PM" />
            <label>Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="">Not set</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            {profileError && <div className="form-error">{profileError}</div>}
            {profileSaved && <p className="form-success">Saved.</p>}
            <button type="submit" className="btn btn-primary" disabled={profileBusy} style={{ marginTop: 8 }}>
              {profileBusy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </div>

        <div className="settings-card" style={{ maxWidth: 640 }}>
          <p className="settings-card-label">Change password</p>
          <form onSubmit={changePassword}>
            <label>Current password</label>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <label>New password</label>
            <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            {passwordError && <div className="form-error">{passwordError}</div>}
            {passwordSaved && <p className="form-success">Password updated.</p>}
            <button type="submit" className="btn btn-primary" disabled={passwordBusy} style={{ marginTop: 8 }}>
              {passwordBusy ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>

        <div className="settings-card" style={{ maxWidth: 640 }}>
          <p className="settings-card-label">Your referral link</p>
          <p className="muted" style={{ marginTop: 0 }}>
            Share it -- when someone joins through your link and subscribes to Pro, you both get a free month.
          </p>
          {referrals && (
            <>
              <div className="inline-form">
                <input type="text" readOnly value={referrals.link} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 260 }} />
                <button type="button" className="btn btn-primary" onClick={copyLink}>
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
              <div className="stat-row" style={{ marginTop: 4 }}>
                <div className="stat"><strong>{referrals.totalReferred}</strong> joined</div>
                <div className="stat"><strong>{referrals.totalRewarded}</strong> converted</div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
