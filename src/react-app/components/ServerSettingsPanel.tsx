import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  banMember,
  boostServer,
  createAutomodRule,
  createChannelWebhook,
  createServerInvite,
  createSlashCommand,
  deleteAutomodRule,
  deleteChannelWebhook,
  deleteServer,
  deleteServerEmoji,
  deleteServerInvite,
  deleteServerSound,
  deleteServerSticker,
  deleteSlashCommand,
  getAutomodRules,
  getChannelWebhooks,
  getModerationReports,
  getMyPermissions,
  getServer,
  getServerBans,
  getServerBoosts,
  getServerBots,
  getServerChannels,
  type Channel,
  getServerEmojis,
  getServerInvites,
  getServerMembers,
  getServerRules,
  getServerSounds,
  getServerStickers,
  getSlashCommands,
  installBot,
  kickMember,
  leaveServer,
  regenerateInvite,
  removeBot,
  setMemberNickname,
  timeoutMember,
  unbanMember,
  unboostServer,
  updateReportStatus,
  updateServer,
  updateServerRules,
  uploadServerEmoji,
  uploadServerSound,
  uploadServerSticker,
  uploadServerIcon,
  type RolePermissions,
  type Server,
  type ServerBan,
  type ServerInvite,
  type ServerMember,
  type UpdateServerPayload,
} from "../lib/api";
import { validateAvatarSourceFile } from "../lib/avatar";
import { resolveHomePath } from "../lib/navigation";
import AvatarCropModal from "./AvatarCropModal";
import RolesSettingsTab from "./RolesSettingsTab";
import ServerIcon from "./ServerIcon";
import VoiceVideoSettingsTab from "./VoiceVideoSettingsTab";
import AuditLogTab from "./AuditLogTab";

type SettingsTab =
  | "overview"
  | "invites"
  | "safety"
  | "members"
  | "roles"
  | "voice-video"
  | "audit"
  | "automod"
  | "rules"
  | "reports"
  | "emojis"
  | "stickers"
  | "sounds"
  | "bots"
  | "webhooks"
  | "commands"
  | "danger";

const TABS: { id: SettingsTab; label: string; ownerOnly?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "invites", label: "Invites", ownerOnly: true },
  { id: "safety", label: "Safety", ownerOnly: true },
  { id: "members", label: "Members" },
  { id: "roles", label: "Roles" },
  { id: "voice-video", label: "Voice & Video" },
  { id: "automod", label: "Automod" },
  { id: "rules", label: "Rules" },
  { id: "reports", label: "Reports" },
  { id: "emojis", label: "Emoji" },
  { id: "stickers", label: "Stickers" },
  { id: "sounds", label: "Sounds" },
  { id: "bots", label: "Bots" },
  { id: "webhooks", label: "Webhooks" },
  { id: "commands", label: "Slash Commands" },
  { id: "audit", label: "Audit Log" },
  { id: "danger", label: "Danger Zone" },
];

interface ServerSettingsPanelProps {
  serverId: string;
  currentUserId: string;
  onClose: () => void;
  onServerUpdated: (server: Server) => void;
  onServerLeft: () => void;
}

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

const UI_TEXT_SCALE_OPTIONS = [
  { value: 85, label: "Compact", hint: "Dense layout" },
  { value: 100, label: "Default", hint: "Standard" },
  { value: 115, label: "Comfortable", hint: "Easier to read" },
  { value: 130, label: "Large", hint: "Maximum size" },
] as const;

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
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [membersSubTab, setMembersSubTab] = useState<"members" | "bans">("members");
  const iconInputRef = useRef<HTMLInputElement>(null);

  const isOwner = server?.ownerId === currentUserId;
  const canManageServer = isOwner || Boolean(permissions?.manage_server || permissions?.administrator);
  const canKick = isOwner || Boolean(permissions?.kick_members || permissions?.administrator);
  const canBan = isOwner || Boolean(permissions?.ban_members || permissions?.administrator);
  const canViewAudit = Boolean(permissions?.view_audit_log || permissions?.administrator || isOwner);
  const canManageMessages = Boolean(permissions?.manage_messages || permissions?.administrator || isOwner);
  const visibleTabs = TABS.filter((item) => {
    if (item.id === "audit") {
      return canViewAudit;
    }
    if (item.id === "reports") {
      return canManageMessages;
    }
    if (item.id === "automod" || item.id === "rules") {
      return canManageServer;
    }
    if (item.id === "emojis" || item.id === "stickers" || item.id === "sounds" || item.id === "bots" || item.id === "webhooks" || item.id === "commands") {
      return canManageServer;
    }
    if (item.ownerOnly) {
      return canManageServer;
    }
    return true;
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [serverResponse, membersResponse, permissionsResponse, channelsResponse] = await Promise.all([
          getServer(serverId),
          getServerMembers(serverId),
          getMyPermissions(serverId),
          getServerChannels(serverId),
        ]);

        if (!cancelled) {
          setServer(serverResponse.server);
          setMembers(membersResponse.members);
          setPermissions(permissionsResponse.permissions);
          setVoiceChannels(
            channelsResponse.channels.filter(
              (channel) => channel.type === "voice" || channel.type === "stage",
            ),
          );
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

  useEffect(() => {
    if (!server || tab !== "invites" || !canManageServer) return;
    void getServerInvites(server.id)
      .then((response) => setInvites(response.invites))
      .catch(() => setInvites([]));
  }, [server, tab, canManageServer]);

  useEffect(() => {
    if (!server || tab !== "members" || !canBan) return;
    void getServerBans(server.id)
      .then((response) => setBans(response.bans))
      .catch(() => setBans([]));
  }, [server, tab, canBan]);

  async function saveSettings(payload: UpdateServerPayload) {
    if (!server || !canManageServer) {
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
    const payload: UpdateServerPayload = {};

    if (isOwner) {
      payload.name = String(formData.get("name") ?? "");
      payload.description = String(formData.get("description") ?? "");
      payload.region = String(formData.get("region") ?? "us-east");
    }

    if (canManageServer) {
      payload.uiTextScale = Number(formData.get("uiTextScale") ?? server.uiTextScale ?? 100);
    }

    await saveSettings(payload);
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
      afkTimeoutMinutes: Number(formData.get("afkTimeoutMinutes") ?? server.afkTimeoutMinutes ?? 5),
      afkChannelId: String(formData.get("afkChannelId") ?? "") || null,
    });
  }

  async function handleRegenerateInvite() {
    if (!server || !canManageServer) {
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
    if (!server || !canManageServer) {
      return;
    }

    await saveSettings({ invitesPaused: !server.invitesPaused });
  }

  async function handleTogglePublic() {
    if (!server || !canManageServer) {
      return;
    }

    await saveSettings({ isPublic: !server.isPublic });
  }

  async function handleTimeoutMember(userId: string) {
    if (!server || !canKick) return;
    const minutes = Number(window.prompt("Timeout duration in minutes:", "10"));
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    setSaving(true);
    try {
      await timeoutMember(server.id, userId, minutes);
      setMessage(`Member timed out for ${minutes} minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not timeout member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleKickMember(userId: string) {
    if (!server || !canKick) {
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

  async function handleBanMember(userId: string) {
    if (!server || !canBan) {
      return;
    }

    const reason = window.prompt("Ban reason (optional):") ?? "";
    if (reason === null) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await banMember(server.id, userId, reason);
      const [membersResponse, bansResponse] = await Promise.all([
        getServerMembers(server.id),
        getServerBans(server.id),
      ]);
      setMembers(membersResponse.members);
      setBans(bansResponse.bans);
      setMessage("Member banned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ban member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnban(userId: string) {
    if (!server || !canBan) return;
    setSaving(true);
    try {
      await unbanMember(server.id, userId);
      const bansResponse = await getServerBans(server.id);
      setBans(bansResponse.bans);
      setMessage("Member unbanned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unban member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateInvite() {
    if (!server || !canManageServer) return;
    const maxUsesRaw = window.prompt("Max uses (blank = unlimited):", "");
    const expiresRaw = window.prompt("Expires in hours (blank = never):", "");
    const maxUses = maxUsesRaw?.trim() ? Number(maxUsesRaw) : null;
    const expiresInHours = expiresRaw?.trim() ? Number(expiresRaw) : null;
    setSaving(true);
    try {
      await createServerInvite(server.id, { maxUses, expiresInHours });
      const response = await getServerInvites(server.id);
      setInvites(response.invites);
      setMessage("Invite created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    if (!server || !canManageServer) return;
    setSaving(true);
    try {
      await deleteServerInvite(server.id, inviteId);
      setInvites((current) => current.filter((item) => item.id !== inviteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete invite.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetNickname(userId: string, currentNickname: string | null | undefined) {
    if (!server) return;
    const nickname = window.prompt("Member nickname (blank to clear):", currentNickname ?? "");
    if (nickname === null) return;
    setSaving(true);
    try {
      await setMemberNickname(server.id, userId, nickname.trim() || null);
      const membersResponse = await getServerMembers(server.id);
      setMembers(membersResponse.members);
      setMessage("Nickname updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update nickname.");
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

                  {canManageServer && (
                    <fieldset className="text-scale-fieldset">
                      <legend>Text Size</legend>
                      <p className="settings-muted">
                        Adjust how large text appears for everyone in this server. Channel names,
                        messages, and member lists all scale together.
                      </p>
                      <div className="text-scale-options" role="radiogroup" aria-label="Text size">
                        {UI_TEXT_SCALE_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="text-scale-option"
                            style={
                              { "--text-scale-preview": String(option.value / 100) } as CSSProperties
                            }
                          >
                            <input
                              type="radio"
                              name="uiTextScale"
                              value={option.value}
                              defaultChecked={(server.uiTextScale ?? 100) === option.value}
                              disabled={saving}
                            />
                            <span className="text-scale-option-sample" aria-hidden="true">
                              Aa
                            </span>
                            <span className="text-scale-option-label">{option.label}</span>
                            <span className="text-scale-option-hint">{option.hint}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {(isOwner || canManageServer) && (
                    <button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  )}
                </form>
              )}

              {tab === "overview" && server && <BoostSection serverId={server.id} />}

              {tab === "invites" && canManageServer && (
                <div className="settings-form">
                  <h3>Invites</h3>
                  <p className="settings-muted">
                    Control how people join your server.
                  </p>
                  <div className="settings-card">
                    <div>
                      <strong>Vanity URL</strong>
                      <p className="settings-muted">
                        Optional custom slug for joins (e.g. commhub.gg/join/my-server).
                      </p>
                    </div>
                    <form
                      className="settings-inline"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        void saveSettings({
                          vanityUrl: String(formData.get("vanityUrl") ?? "").trim().toLowerCase() || null,
                        });
                      }}
                    >
                      <input
                        name="vanityUrl"
                        defaultValue={server.vanityUrl ?? ""}
                        placeholder="my-server"
                        pattern="[a-z0-9-]{2,32}"
                        disabled={saving}
                      />
                      <button type="submit" className="secondary-button" disabled={saving}>
                        Save
                      </button>
                    </form>
                  </div>
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
                      <strong>Public Server</strong>
                      <p className="settings-muted">
                        List this server in the public directory so anyone can discover and join it.
                        Add a description and icon in Overview so it looks great in the list.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={server.isPublic ? "toggle active" : "toggle"}
                      onClick={() => void handleTogglePublic()}
                      disabled={saving}
                    >
                      {server.isPublic ? "Listed" : "Private"}
                    </button>
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

                  <div className="settings-card">
                    <div className="settings-inline">
                      <strong>Custom Invites</strong>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleCreateInvite()}
                        disabled={saving}
                      >
                        Create Invite
                      </button>
                    </div>
                    {invites.length === 0 ? (
                      <p className="settings-muted">No custom invites yet.</p>
                    ) : (
                      <div className="invite-list">
                        {invites.map((invite) => (
                          <div key={invite.id} className="invite-row">
                            <div>
                              <code>{invite.code}</code>
                              <span className="settings-muted">
                                {invite.uses}
                                {invite.maxUses ? `/${invite.maxUses}` : ""} uses
                                {invite.expiresAt
                                  ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                                  : " · never expires"}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="danger-button subtle"
                              onClick={() => void handleDeleteInvite(invite.id)}
                              disabled={saving}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "safety" && canManageServer && (
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
                  <label>
                    AFK Timeout (minutes)
                    <input
                      type="number"
                      name="afkTimeoutMinutes"
                      min={1}
                      max={60}
                      defaultValue={server.afkTimeoutMinutes ?? 5}
                      disabled={saving}
                    />
                  </label>
                  <label>
                    AFK Channel
                    <select name="afkChannelId" defaultValue={server.afkChannelId ?? ""} disabled={saving}>
                      <option value="">None</option>
                      {voiceChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name} ({channel.type})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </form>
              )}

              {tab === "members" && (
                <div className="settings-form">
                  <div className="settings-subtabs">
                    <button
                      type="button"
                      className={membersSubTab === "members" ? "active" : ""}
                      onClick={() => setMembersSubTab("members")}
                    >
                      Members
                    </button>
                    {canBan && (
                      <button
                        type="button"
                        className={membersSubTab === "bans" ? "active" : ""}
                        onClick={() => setMembersSubTab("bans")}
                      >
                        Bans
                      </button>
                    )}
                  </div>

                  {membersSubTab === "bans" && canBan ? (
                    <>
                      <h3>Banned Users</h3>
                      <p className="settings-muted">{bans.length} ban(s).</p>
                      <div className="member-list">
                        {bans.map((ban) => (
                          <div key={ban.id} className="member-row">
                            <div>
                              <strong>{ban.username ?? "Unknown user"}</strong>
                              {ban.reason && <span className="settings-muted">{ban.reason}</span>}
                            </div>
                            {ban.userId && (
                              <button
                                type="button"
                                className="secondary-button subtle"
                                onClick={() => void handleUnban(ban.userId!)}
                                disabled={saving}
                              >
                                Unban
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>Members</h3>
                      <p className="settings-muted">{members.length} member(s) in this server.</p>
                      <div className="member-list">
                        {members.map((member) => (
                          <div key={member.id} className="member-row">
                            <div>
                              <button
                                type="button"
                                className="member-nickname-btn"
                                onClick={() =>
                                  void handleSetNickname(member.userId, member.nickname)
                                }
                                title="Click to edit nickname"
                              >
                                <strong>{member.nickname || member.displayName}</strong>
                              </button>
                              <span className="settings-muted">@{member.username}</span>
                              {member.isOwner && <span className="member-badge">Owner</span>}
                            </div>
                            {(canKick || canBan) &&
                              !member.isOwner &&
                              member.userId !== currentUserId && (
                                <div className="member-actions">
                                  {canKick && (
                                    <button
                                      type="button"
                                      className="secondary-button subtle"
                                      onClick={() => void handleSetNickname(member.userId, member.nickname)}
                                      disabled={saving}
                                    >
                                      Nickname
                                    </button>
                                  )}
                                  {canKick && (
                                    <button
                                      type="button"
                                      className="secondary-button subtle"
                                      onClick={() => void handleTimeoutMember(member.userId)}
                                      disabled={saving}
                                    >
                                      Timeout
                                    </button>
                                  )}
                                  {canKick && (
                                    <button
                                      type="button"
                                      className="danger-button subtle"
                                      onClick={() => void handleKickMember(member.userId)}
                                      disabled={saving}
                                    >
                                      Kick
                                    </button>
                                  )}
                                  {canBan && (
                                    <button
                                      type="button"
                                      className="danger-button subtle"
                                      onClick={() => void handleBanMember(member.userId)}
                                      disabled={saving}
                                    >
                                      Ban
                                    </button>
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "roles" && (
                <RolesSettingsTab serverId={server.id} members={members} />
              )}

              {tab === "voice-video" && <VoiceVideoSettingsTab />}

              {tab === "audit" && canViewAudit && <AuditLogTab serverId={server.id} />}

              {tab === "automod" && canManageServer && (
                <AutomodTab serverId={server.id} />
              )}

              {tab === "rules" && canManageServer && (
                <RulesTab serverId={server.id} />
              )}

              {tab === "reports" && canManageMessages && (
                <ReportsTab serverId={server.id} />
              )}

              {tab === "emojis" && canManageServer && <EmojisTab serverId={server.id} />}
              {tab === "stickers" && canManageServer && <StickersTab serverId={server.id} />}
              {tab === "sounds" && canManageServer && <SoundsTab serverId={server.id} />}
              {tab === "bots" && canManageServer && <BotsTab serverId={server.id} />}
              {tab === "webhooks" && canManageServer && <WebhooksTab serverId={server.id} />}
              {tab === "commands" && canManageServer && <CommandsTab serverId={server.id} />}

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

function AutomodTab({ serverId }: { serverId: string }) {
  const [rules, setRules] = useState<Awaited<ReturnType<typeof getAutomodRules>>["rules"]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getAutomodRules(serverId)
      .then((r) => setRules(r.rules))
      .finally(() => setLoading(false));
  }, [serverId]);

  async function addKeywordRule() {
    if (!keyword.trim()) return;
    await createAutomodRule(serverId, {
      name: `Block "${keyword.trim()}"`,
      triggerType: "keyword",
      action: "block",
      config: { keywords: [keyword.trim()] },
    });
    setKeyword("");
    const r = await getAutomodRules(serverId);
    setRules(r.rules);
  }

  return (
    <div className="settings-form">
      <h3>Automod</h3>
      <p className="settings-muted">Block messages containing specific keywords.</p>
      <div className="role-assign-row">
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Blocked word" />
        <button type="button" className="secondary-button" onClick={() => void addKeywordRule()}>
          Add Rule
        </button>
      </div>
      {loading ? <p>Loading...</p> : (
        <ul>
          {rules.map((rule) => (
            <li key={rule.id} className="member-row">
              <span>{rule.name}</span>
              <button type="button" onClick={() => void deleteAutomodRule(serverId, rule.id).then(() => getAutomodRules(serverId).then((r) => setRules(r.rules)))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RulesTab({ serverId }: { serverId: string }) {
  const [rulesText, setRulesText] = useState("");
  const [requireAcceptance, setRequireAcceptance] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getServerRules(serverId).then((r) => {
      setRulesText(r.rulesText);
      setRequireAcceptance(r.requireAcceptance);
    });
  }, [serverId]);

  async function save() {
    setSaving(true);
    await updateServerRules(serverId, { rulesText, requireAcceptance });
    setSaving(false);
  }

  return (
    <div className="settings-form">
      <h3>Server Rules</h3>
      <textarea rows={8} value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder="Write your server rules..." />
      <label className="permission-item">
        <input type="checkbox" checked={requireAcceptance} onChange={(e) => setRequireAcceptance(e.target.checked)} />
        <span>Require members to accept rules</span>
      </label>
      <button type="button" className="secondary-button" onClick={() => void save()} disabled={saving}>
        Save Rules
      </button>
    </div>
  );
}

function ReportsTab({ serverId }: { serverId: string }) {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof getModerationReports>>["reports"]>([]);

  useEffect(() => {
    void getModerationReports(serverId).then((r) => setReports(r.reports));
  }, [serverId]);

  return (
    <div className="settings-form">
      <h3>Moderation Reports</h3>
      {reports.length === 0 ? (
        <p className="settings-muted">No open reports.</p>
      ) : (
        reports.map((report) => (
          <div key={report.id} className="member-row">
            <div>
              <strong>{report.targetType}</strong> · {report.reason}
              <small> by @{report.reporterUsername} · {report.status}</small>
            </div>
            {report.status === "open" && (
              <div className="member-actions">
                <button type="button" onClick={() => void updateReportStatus(serverId, report.id, "resolved").then(() => getModerationReports(serverId).then((r) => setReports(r.reports)))}>
                  Resolve
                </button>
                <button type="button" onClick={() => void updateReportStatus(serverId, report.id, "dismissed").then(() => getModerationReports(serverId).then((r) => setReports(r.reports)))}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function EmojisTab({ serverId }: { serverId: string }) {
  const [emojis, setEmojis] = useState<Awaited<ReturnType<typeof getServerEmojis>>["emojis"]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    void getServerEmojis(serverId).then((r) => setEmojis(r.emojis));
  }, [serverId]);

  return (
    <div className="settings-form">
      <h3>Custom Emoji</h3>
      <div className="role-assign-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="emoji_name" />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            file &&
            name &&
            void uploadServerEmoji(serverId, name, file).then(() =>
              getServerEmojis(serverId).then((r) => setEmojis(r.emojis)),
            )
          }
        >
          Upload
        </button>
      </div>
      <div className="emoji-grid">
        {emojis.map((e) => (
          <div key={e.id} className="emoji-item">
            <img src={e.url} alt={e.name} width={32} height={32} />
            <span>:{e.name}:</span>
            <button
              type="button"
              onClick={() =>
                void deleteServerEmoji(serverId, e.id).then(() =>
                  getServerEmojis(serverId).then((r) => setEmojis(r.emojis)),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StickersTab({ serverId }: { serverId: string }) {
  const [stickers, setStickers] = useState<Awaited<ReturnType<typeof getServerStickers>>["stickers"]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    void getServerStickers(serverId).then((r) => setStickers(r.stickers));
  }, [serverId]);

  return (
    <div className="settings-form">
      <h3>Stickers</h3>
      <div className="role-assign-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sticker_name" />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            file &&
            name &&
            void uploadServerSticker(serverId, name, file).then(() =>
              getServerStickers(serverId).then((r) => setStickers(r.stickers)),
            )
          }
        >
          Upload
        </button>
      </div>
      <div className="emoji-grid">
        {stickers.map((s) => (
          <div key={s.id} className="emoji-item">
            <img src={s.url} alt={s.name} width={48} height={48} />
            <span>{s.name}</span>
            <button
              type="button"
              onClick={() =>
                void deleteServerSticker(serverId, s.id).then(() =>
                  getServerStickers(serverId).then((r) => setStickers(r.stickers)),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebhooksTab({ serverId }: { serverId: string }) {
  const [webhooks, setWebhooks] = useState<Awaited<ReturnType<typeof getChannelWebhooks>>["webhooks"]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  useEffect(() => {
    void getChannelWebhooks(serverId).then((r) => setWebhooks(r.webhooks));
    void getServerChannels(serverId).then((r) => setChannels(r.channels));
  }, [serverId]);

  return (
    <div className="settings-form">
      <h3>Webhooks</h3>
      {createdToken && <p className="settings-success">Webhook URL: {createdToken}</p>}
      <div className="role-assign-row">
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">Channel...</option>
          {channels
            .filter((c) => c.type === "text")
            .map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook name" />
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            channelId &&
            name &&
            void createChannelWebhook(serverId, channelId, name).then((r) => {
              setCreatedToken(r.webhook.url);
              return getChannelWebhooks(serverId).then((w) => setWebhooks(w.webhooks));
            })
          }
        >
          Create
        </button>
      </div>
      <ul>
        {webhooks.map((w) => (
          <li key={w.id} className="member-row">
            <span>
              {w.name} · #{w.channelName}
            </span>
            <button
              type="button"
              onClick={() =>
                void deleteChannelWebhook(serverId, w.id).then(() =>
                  getChannelWebhooks(serverId).then((r) => setWebhooks(r.webhooks)),
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoostSection({ serverId }: { serverId: string }) {
  const [boosts, setBoosts] = useState<Awaited<ReturnType<typeof getServerBoosts>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadBoosts() {
    setLoading(true);
    void getServerBoosts(serverId)
      .then((data) => setBoosts(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load boosts."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadBoosts();
  }, [serverId]);

  async function handleBoost() {
    setSaving(true);
    setError(null);
    try {
      await boostServer(serverId);
      loadBoosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not boost server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnboost() {
    setSaving(true);
    setError(null);
    try {
      await unboostServer(serverId);
      loadBoosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove boost.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="settings-muted boost-section">Loading boost info…</p>;
  }

  if (!boosts) {
    return null;
  }

  return (
    <div className="settings-form boost-section">
      <h3>Server Boost</h3>
      <p className="settings-muted">
        Boost this server to unlock perks for everyone. Level {boosts.boostLevel} ·{" "}
        {boosts.boostCount} boost{boosts.boostCount === 1 ? "" : "s"}
      </p>
      {error && <div className="settings-error">{error}</div>}
      <div className="boost-stats">
        <span className="boost-badge">Level {boosts.boostLevel}</span>
        <span>{boosts.perks.uploadLimitMb} MB uploads</span>
        <span>{boosts.perks.emojiSlots} emoji slots</span>
        <span>{boosts.perks.soundboardSlots} soundboard slots</span>
      </div>
      {boosts.meBoosted ? (
        <button type="button" className="secondary-button" disabled={saving} onClick={() => void handleUnboost()}>
          {saving ? "Removing…" : "Remove Boost"}
        </button>
      ) : (
        <button type="button" disabled={saving} onClick={() => void handleBoost()}>
          {saving ? "Boosting…" : "Boost Server"}
        </button>
      )}
    </div>
  );
}

function SoundsTab({ serverId }: { serverId: string }) {
  const [sounds, setSounds] = useState<Awaited<ReturnType<typeof getServerSounds>>["sounds"]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getServerSounds(serverId).then((r) => setSounds(r.sounds));
  }, [serverId]);

  return (
    <div className="settings-form sounds-tab">
      <h3>Soundboard</h3>
      <p className="settings-muted">Upload short audio clips for the voice channel soundboard.</p>
      {error && <div className="settings-error">{error}</div>}
      <div className="role-assign-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="sound_name" />
        <input
          type="file"
          accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            if (!file || !name) return;
            setError(null);
            void uploadServerSound(serverId, name, file)
              .then(() => getServerSounds(serverId).then((r) => setSounds(r.sounds)))
              .then(() => {
                setName("");
                setFile(null);
              })
              .catch((err) =>
                setError(err instanceof Error ? err.message : "Upload failed."),
              );
          }}
        >
          Upload
        </button>
      </div>
      <ul className="sounds-list">
        {sounds.map((sound) => (
          <li key={sound.id} className="member-row">
            <span>{sound.name}</span>
            <button
              type="button"
              onClick={() =>
                void deleteServerSound(serverId, sound.id).then(() =>
                  getServerSounds(serverId).then((r) => setSounds(r.sounds)),
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BotsTab({ serverId }: { serverId: string }) {
  const [bots, setBots] = useState<Awaited<ReturnType<typeof getServerBots>>["bots"]>([]);
  const [appId, setAppId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    void getServerBots(serverId).then((r) => setBots(r.bots));
  }, [serverId]);

  async function handleInstall() {
    if (!appId.trim()) return;
    setInstalling(true);
    setError(null);
    try {
      await installBot(serverId, appId.trim());
      const response = await getServerBots(serverId);
      setBots(response.bots);
      setAppId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not install bot.");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="settings-form bots-tab">
      <h3>Installed Bots</h3>
      <p className="settings-muted">Install a bot by pasting its application ID from the Developer tab.</p>
      {error && <div className="settings-error">{error}</div>}
      <div className="role-assign-row">
        <input
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="Application ID"
        />
        <button
          type="button"
          className="secondary-button"
          disabled={installing || !appId.trim()}
          onClick={() => void handleInstall()}
        >
          {installing ? "Installing…" : "Install Bot"}
        </button>
      </div>
      <ul>
        {bots.map((bot) => (
          <li key={bot.applicationId} className="member-row">
            <span>
              {bot.name} (@{bot.username})
            </span>
            <button
              type="button"
              onClick={() =>
                void removeBot(serverId, bot.applicationId).then(() =>
                  getServerBots(serverId).then((r) => setBots(r.bots)),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {bots.length === 0 && <p className="settings-muted">No bots installed.</p>}
    </div>
  );
}

function CommandsTab({ serverId }: { serverId: string }) {
  const [commands, setCommands] = useState<Awaited<ReturnType<typeof getSlashCommands>>["commands"]>([]);
  const [name, setName] = useState("");
  const [responseText, setResponseText] = useState("");

  useEffect(() => {
    void getSlashCommands(serverId).then((r) => setCommands(r.commands));
  }, [serverId]);

  return (
    <div className="settings-form">
      <h3>Slash Commands</h3>
      <div className="role-assign-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="command_name" />
        <input value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Response text" />
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            name &&
            responseText &&
            void createSlashCommand(serverId, { name, responseText }).then(() =>
              getSlashCommands(serverId).then((r) => setCommands(r.commands)),
            )
          }
        >
          Add
        </button>
      </div>
      <ul>
        {commands.map((cmd) => (
          <li key={cmd.id} className="member-row">
            <span>
              /{cmd.name} — {cmd.responseText}
            </span>
            <button
              type="button"
              onClick={() =>
                void deleteSlashCommand(serverId, cmd.id).then(() =>
                  getSlashCommands(serverId).then((r) => setCommands(r.commands)),
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
