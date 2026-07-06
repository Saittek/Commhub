import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  deleteAccount,
  getBlockedUsers,
  getPrivacySettings,
  sendVerificationEmail,
  unblockUser,
  updatePrivacySettings,
  type BlockedUser,
  type PrivacySettings,
} from "../lib/api";

export default function PrivacySettingsTab() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getPrivacySettings(), getBlockedUsers()])
      .then(([privacy, blocked]) => {
        setSettings(privacy.settings);
        setEmailVerified(privacy.emailVerified);
        setBlocks(blocked.blocks);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load privacy settings.");
      });
  }, []);

  if (!user || !settings) {
    return <p className="settings-muted">Loading privacy settings...</p>;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await updatePrivacySettings(settings!);
      setSettings(response.settings);
      setMessage("Privacy settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyEmail() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await sendVerificationEmail();
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification email.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      setError("Enter your password to delete your account.");
      return;
    }

    if (!window.confirm("Delete your account permanently? This cannot be undone.")) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteAccount(deletePassword);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account.");
      setSaving(false);
    }
  }

  return (
    <div className="settings-form privacy-settings">
      <h3>Privacy & Safety</h3>
      <p className="settings-muted">
        Control how others interact with you and what content gets filtered.
      </p>

      {error && <div className="settings-error">{error}</div>}
      {message && <div className="settings-success">{message}</div>}

      <section className="privacy-section">
        <h4>Email verification</h4>
        <p className="settings-muted">
          {emailVerified
            ? "Your email is verified."
            : "Verify your email to meet server verification requirements."}
        </p>
        {!emailVerified && (
          <button type="button" className="secondary-button" onClick={() => void handleVerifyEmail()} disabled={saving}>
            Send verification email
          </button>
        )}
      </section>

      <form onSubmit={(event) => void handleSave(event)}>
        <section className="privacy-section">
          <h4>How others can interact</h4>
          <label>
            Who can send you direct messages
            <select
              value={settings.allowDmFrom}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current!,
                  allowDmFrom: Number(event.target.value) as 0 | 1 | 2,
                }))
              }
              disabled={saving}
            >
              <option value={0}>Nobody</option>
              <option value={1}>Server members only</option>
              <option value={2}>Everyone</option>
            </select>
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.allowFriendRequests}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current!,
                  allowFriendRequests: event.target.checked,
                }))
              }
              disabled={saving}
            />
            Allow friend requests
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.allowServerInvites}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current!,
                  allowServerInvites: event.target.checked,
                }))
              }
              disabled={saving}
            />
            Allow others to add you to servers
          </label>
        </section>

        <section className="privacy-section">
          <h4>Activity & content</h4>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.showActivityStatus}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current!,
                  showActivityStatus: event.target.checked,
                }))
              }
              disabled={saving}
            />
            Show online status to server members
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={settings.filterExplicitContent}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current!,
                  filterExplicitContent: event.target.checked,
                }))
              }
              disabled={saving}
            />
            Filter explicit media in uploads
          </label>
        </section>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Privacy Settings"}
        </button>
      </form>

      <section className="privacy-section">
        <h4>Blocked users</h4>
        {blocks.length === 0 ? (
          <p className="settings-muted">You have not blocked anyone.</p>
        ) : (
          <div className="member-list">
            {blocks.map((block) => (
              <div key={block.userId} className="member-row">
                <div>
                  <strong>{block.displayName}</strong>
                  <span className="settings-muted">@{block.username}</span>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void unblockUser(block.userId).then(() => {
                      setBlocks((current) => current.filter((item) => item.userId !== block.userId));
                    });
                  }}
                  disabled={saving}
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="privacy-section danger-card">
        <h4>Delete account</h4>
        <p className="settings-muted">
          Permanently delete your account and remove your data from Commhub.
        </p>
        <label>
          Confirm with password
          <input
            type="password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            disabled={saving}
            autoComplete="current-password"
          />
        </label>
        <button type="button" className="danger-button" onClick={() => void handleDeleteAccount()} disabled={saving}>
          Delete Account
        </button>
      </section>
    </div>
  );
}
