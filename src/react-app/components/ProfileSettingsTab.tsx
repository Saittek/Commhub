import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AVATAR_SIZE, validateAvatarSourceFile } from "../lib/avatar";
import AvatarCropModal from "./AvatarCropModal";
import UserAvatar from "./UserAvatar";

export default function ProfileSettingsTab() {
  const { user, updateProfile, changePassword, uploadAvatar } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setDisplayName(user?.displayName ?? "");
  }, [user?.email, user?.displayName]);

  if (!user) {
    return null;
  }

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    clearFeedback();

    try {
      await updateProfile({ email, displayName: displayName.trim() });
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);
    clearFeedback();

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  function handleAvatarPick(file: File | undefined) {
    if (!file) {
      return;
    }

    clearFeedback();

    void validateAvatarSourceFile(file)
      .then(() => {
        setCropFile(file);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not open image.");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      });
  }

  async function handleAvatarApply(file: File) {
    setUploadingAvatar(true);
    clearFeedback();

    try {
      await uploadAvatar(file);
      setMessage("Avatar updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload avatar.");
      throw err;
    } finally {
      setUploadingAvatar(false);
      setCropFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleCropClose() {
    setCropFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const profileDirty =
    email.trim().toLowerCase() !== user.email.toLowerCase() ||
    displayName.trim() !== user.displayName.trim();
  const passwordReady =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  return (
    <div className="profile-settings-stack">
      <section className="settings-form profile-settings">
        <h3>My Profile</h3>
        <p className="settings-muted">Manage your avatar, username, and email.</p>

        <div className="profile-settings-avatar-block">
          <button
            type="button"
            className="profile-settings-avatar-button"
            title="Change avatar"
            disabled={uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
          >
            <UserAvatar
              username={user.username}
              avatarUrl={user.avatarUrl}
              size="profile"
            />
            <span className="profile-settings-avatar-overlay">
              {uploadingAvatar ? "Uploading..." : "Change"}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            hidden
            onChange={(event) => handleAvatarPick(event.target.files?.[0])}
          />
          <div className="profile-settings-avatar-help">
            <strong>Avatar image</strong>
            <span>
              Upload any PNG, JPEG, or WebP up to 8 MB, then adjust it in the circle. Saved as{" "}
              {AVATAR_SIZE}×{AVATAR_SIZE}.
            </span>
          </div>
        </div>

        <form onSubmit={(event) => void handleProfileSubmit(event)}>
          <label>
            Username
            <input type="text" value={user.username} disabled readOnly />
          </label>

          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={savingProfile}
              maxLength={32}
              autoComplete="nickname"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={savingProfile}
              autoComplete="email"
            />
          </label>

          <button type="submit" disabled={savingProfile || !profileDirty}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </section>

      <section className="settings-form profile-settings">
        <h3>Password</h3>
        <p className="settings-muted">Change the password you use to sign in.</p>

        <form onSubmit={(event) => void handlePasswordSubmit(event)}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={savingPassword}
              autoComplete="current-password"
            />
          </label>

          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={savingPassword}
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={savingPassword}
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          <button type="submit" disabled={savingPassword || !passwordReady}>
            {savingPassword ? "Updating..." : "Change Password"}
          </button>
        </form>
      </section>

      {error && <div className="settings-error">{error}</div>}
      {message && <div className="settings-success">{message}</div>}

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onClose={handleCropClose}
          onApply={handleAvatarApply}
        />
      )}
    </div>
  );
}
