import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteServer,
  getServer,
  getServerMembers,
  kickMember,
  leaveServer,
  regenerateInvite,
  updateServer,
  uploadServerIcon,
  type Server,
  type ServerMember,
  type UpdateServerPayload,
} from "../lib/api";
import { validateAvatarSourceFile } from "../lib/avatar";
import { resolveHomePath } from "../lib/navigation";
import AvatarCropModal from "./AvatarCropModal";
import RolesSettingsTab from "./RolesSettingsTab";
import ServerIcon from "./ServerIcon";
import VoiceVideoSettingsTab from "./VoiceVideoSettingsTab";

type SettingsTab =
  | "overview"
  | "invites"
  | "safety"
  | "members"
  | "roles"
  | "voice-video"
  | "danger";

interface ServerSettingsPanelProps {
  serverId: string;
  currentUserId: string;
  onClose: () => void;
  onServerUpdated: (server: Server) => void;
  onServerLeft: () => void;
}

const TABS: { id: SettingsTab; label: string; ownerOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "invites", label: "Invites", ownerOnly: true },
  { id: "safety", label: "Safety", ownerOnly: true },
  { id: "members", label: "Members" },
  { id: "roles", label: "Roles" },
  { id: "voice-video", label: "Voice & Video" },
  { id: "danger", label: "Danger Zone" },
];

const REGIONS = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "eu", label: "Europe" },
  { value: "asia", label: "Asia" },
];

const VERIFICATION_LEVELS = [
  { value: 0, label: "None", description: "No restrictions." },
  { value: 1, label: "Low", description: "Must have a verified email on their account." },
  { value: 2, label: "Medium", description: "Must be a member for longer than 5 minutes." },
  { value: 3, label: "High", description: "Must be a member for longer than 10 minutes." },
];

export default function ServerSettingsPanel({
  serverId,
  currentUserId,
  onClose,
  onServerUpdated,
  onServerLeft,
}: ServerSettingsPanelProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [server, setServer] = useState<Server | null>(null);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const isOwner = server?.ownerId === currentUserId;
  const visibleTabs = TABS.filter((item) => !item.ownerOnly || isOwner);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [serverResponse, membersResponse] = await Promise.all([
          getServer(serverId),
          getServerMembers(serverId),
        ]);

        if (!cancelled) {
          setServer(serverResponse.server);
          setMembers(membersResponse.members);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load server settings.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  async function saveSettings(payload: UpdateServerPayload) {
    if (!server || !isOwner) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await updateServer(server.id, payload);
      setServer(response.server);
      onServerUpdated(response.server);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!server) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    await saveSettings({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      region: String(formData.get("region") ?? "us-east"),
    });
  }

  async function handleSafetySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!server) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    await saveSettings({
      verificationLevel: Number(formData.get("verificationLevel") ?? 0),
      defaultNotifications: String(formData.get("defaultNotifications") ?? "all"),
      explicitContentFilter: formData.get("explicitContentFilter") === "on",
    });
  }

  async function handleRegenerateInvite() {
    if (!server || !isOwner) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await regenerateInvite(server.id);
      setServer(response.server);
      onServerUpdated(response.server);
      setMessage("Invite code regenerated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate invite.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleInvites() {
    if (!server || !isOwner) {
      return;
    }

    await saveSettings({ invitesPaused: !server.invitesPaused });
  }

  async function handleKickMember(userId: string) {
    if (!server || !isOwner) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await kickMember(server.id, userId);
      const membersResponse = await getServerMembers(server.id);
      setMembers(membersResponse.members);
      setMessage("Member removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLeaveServer() {
    if (!server) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await leaveServer(server.id);
      onServerLeft();
      onClose();
      navigate(await resolveHomePath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteServer() {
    if (!server || !isOwner || deleteConfirm !== server.name) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteServer(server.id);
      onServerLeft();
      onClose();
      navigate(await resolveHomePath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete server.");
    } finally {
      setSaving(false);
    }
  }

  function copyInviteCode() {
    if (!server?.inviteCode) {
      return;
    }

    void navigator.clipboard.writeText(server.inviteCode);
    setMessage("Invite code copied.");
  }

  function handleIconPick(file: File | undefined) {
    if (!file || !isOwner) {
      return;
    }

    setError(null);
    setMessage(null);

    void validateAvatarSourceFile(file)
      .then(() => {
        setCropFile(file);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not open image.");
        if (iconInputRef.current) {
          iconInputRef.current.value = "";
        }
      });
  }

  async function handleIconApply(file: File) {
    if (!server) {
      return;
    }

    setUploadingIcon(true);
    setError(null);
    setMessage(null);

    try {
      const response = await uploadServerIcon(server.id, file);
      const baseUrl = response.server.iconUrl?.split("?")[0] ?? null;
      const nextServer = {
        ...response.server,
        iconUrl: baseUrl ? `${baseUrl}?v=${Date.now()}` : null,
      };
      setServer(nextServer);
      onServerUpdated(nextServer);
      setMessage("Server icon updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload server icon.");
      throw err;
    } finally {
      setUploadingIcon(false);
      setCropFile(null);
      if (iconInputRef.current) {
        iconInputRef.current.value = "";
      }
    }
  }

  function handleIconCropClose() {
    setCropFile(null);
    if (iconInputRef.current) {
      iconInputRef.current.value = "";
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <h2>{server?.name ?? "Server Settings"}</h2>
            <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <nav className="settings-nav">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "active" : ""}
                onClick={() => {
                  setTab(item.id);
                  setError(null);
                  setMessage(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="settings-content">
          {loading ? (
            <p className="settings-muted">Loading server settings...</p>
          ) : !server ? (
            <p className="settings-error">{error ?? "Server not found."}</p>
          ) : (
            <>
              {error && <div className="settings-error">{error}</div>}
              {message && <div className="settings-success">{message}</div>}

              {tab === "overview" && (
                <form className="settings-form" onSubmit={handleOverviewSubmit}>
                  <h3>Overview</h3>
                  <p className="settings-muted">
                    Customize how your server appears to members.
                  </p>

                  {isOwner && (
                    <div className="profile-settings-avatar-block server-icon-settings-block">
                      <button
                        type="button"
                        className="profile-settings-avatar-button"
                        onClick={() => iconInputRef.current?.click()}
                        disabled={saving || uploadingIcon}
                        aria-label="Change server icon"
                      >
                        <ServerIcon
                          serverName={server.name}
                          iconUrl={server.iconUrl}
                          size="settings"
                        />
                        <span className="profile-settings-avatar-overlay">
                          {uploadingIcon ? "Saving..." : "Change"}
                        </span>
                      </button>
                      <div className="profile-settings-avatar-help">
                        <strong>Server Icon</strong>
                        <span>PNG, JPEG, or WebP up to 8 MB. Cropped to a circle.</span>
                      </div>
                      <input
                        ref={iconInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        onChange={(event) => handleIconPick(event.target.files?.[0])}
                      />
                    </div>
                  )}

                  {!isOwner && server.iconUrl && (
                    <div className="server-icon-settings-block server-icon-settings-readonly">
                      <ServerIcon
                        serverName={server.name}
                        iconUrl={server.iconUrl}
                        size="settings"
                      />
                    </div>
                  )}

                  <label>
                    Server Name
                    <input
                      name="name"
                      defaultValue={server.name}
                      disabled={!isOwner || saving}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={server.description ?? ""}
                      disabled={!isOwner || saving}
                      rows={4}
                      maxLength={300}
                      placeholder="Tell people what this server is about."
                    />
                  </label>
                  <label>
                    Server Region
                    <select
                      name="region"
                      defaultValue={server.region ?? "us-east"}
                      disabled={!isOwner || saving}
                    >
                      {REGIONS.map((region) => (
                        <option key={region.value} value={region.value}>
                          {region.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isOwner && (
                    <button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  )}
                </form>
              )}

              {tab === "invites" && isOwner && (
                <div className="settings-form">
                  <h3>Invites</h3>
                  <p className="settings-muted">
                    Control how people join your server.
                  </p>
                  <div className="settings-card">
                    <div>
                      <strong>Invite Code</strong>
                      <p className="settings-muted">Share this code so others can join.</p>
                    </div>
                    <div className="settings-inline">
                      <code className="invite-code">{server.inviteCode}</code>
                      <button type="button" className="secondary-button" onClick={copyInviteCode}>
                        Copy
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleRegenerateInvite()}
                        disabled={saving}
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                  <div className="settings-card settings-toggle-row">
                    <div>
                      <strong>Pause Invites</strong>
                      <p className="settings-muted">
                        Temporarily stop new members from joining with your invite code.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={server.invitesPaused ? "toggle active" : "toggle"}
                      onClick={() => void handleToggleInvites()}
                      disabled={saving}
                    >
                      {server.invitesPaused ? "Paused" : "Active"}
                    </button>
                  </div>
                </div>
              )}

              {tab === "safety" && isOwner && (
                <form className="settings-form" onSubmit={handleSafetySubmit}>
                  <h3>Safety Setup</h3>
                  <p className="settings-muted">
                    Moderation and verification settings for your community.
                  </p>
                  <label>
                    Verification Level
                    <select
                      name="verificationLevel"
                      defaultValue={server.verificationLevel ?? 0}
                      disabled={saving}
                    >
                      {VERIFICATION_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label} — {level.description}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Default Notification Settings
                    <select
                      name="defaultNotifications"
                      defaultValue={server.defaultNotifications ?? "all"}
                      disabled={saving}
                    >
                      <option value="all">All Messages</option>
                      <option value="mentions">Only @mentions</option>
                      <option value="nothing">Nothing</option>
                    </select>
                  </label>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      name="explicitContentFilter"
                      defaultChecked={server.explicitContentFilter ?? false}
                      disabled={saving}
                    />
                    Scan media from all members for explicit content
                  </label>
                  <button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              )}

              {tab === "members" && (
                <div className="settings-form">
                  <h3>Members</h3>
                  <p className="settings-muted">{members.length} member(s) in this server.</p>
                  <div className="member-list">
                    {members.map((member) => (
                      <div key={member.id} className="member-row">
                        <div>
                          <strong>{member.displayName}</strong>
                          <span className="settings-muted">@{member.username}</span>
                          {member.isOwner && <span className="member-badge">Owner</span>}
                        </div>
                        {isOwner && !member.isOwner && member.userId !== currentUserId && (
                          <button
                            type="button"
                            className="danger-button subtle"
                            onClick={() => void handleKickMember(member.userId)}
                            disabled={saving}
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "roles" && (
                <RolesSettingsTab serverId={server.id} members={members} />
              )}

              {tab === "voice-video" && <VoiceVideoSettingsTab />}

              {tab === "danger" && (
                <div className="settings-form">
                  <h3>Danger Zone</h3>
                  {!isOwner ? (
                    <div className="settings-card danger-card">
                      <div>
                        <strong>Leave Server</strong>
                        <p className="settings-muted">
                          You will need a new invite to rejoin this server.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleLeaveServer()}
                        disabled={saving}
                      >
                        Leave Server
                      </button>
                    </div>
                  ) : (
                    <div className="settings-card danger-card">
                      <div>
                        <strong>Delete Server</strong>
                        <p className="settings-muted">
                          Permanently delete this server and remove all members. This cannot be
                          undone.
                        </p>
                        <input
                          type="text"
                          placeholder={`Type "${server.name}" to confirm`}
                          value={deleteConfirm}
                          onChange={(event) => setDeleteConfirm(event.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDeleteServer()}
                        disabled={saving || deleteConfirm !== server.name}
                      >
                        Delete Server
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onClose={handleIconCropClose}
          onApply={handleIconApply}
        />
      )}
    </div>
  );
}
