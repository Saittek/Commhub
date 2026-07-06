import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import {
  acceptFriendRequest,
  banMember,
  getMyPermissions,
  getUserProfile,
  kickMember,
  openDm,
  sendDmMessage,
  sendFriendRequest,
  setMemberNickname,
  timeoutMember,
  type RolePermissions,
  type UserProfile,
} from "../lib/api";
import UserAvatar from "./UserAvatar";

interface UserProfilePopoverProps {
  userId: string;
  serverId?: string | null;
  anchorRect: DOMRect;
  onClose: () => void;
  onMessage?: (userId: string) => void;
  onMemberUpdated?: () => void;
}

function presenceClass(status: string | undefined): string {
  switch (status) {
    case "idle":
      return "user-profile-presence-dot user-profile-presence-dot--idle";
    case "dnd":
      return "user-profile-presence-dot user-profile-presence-dot--dnd";
    case "invisible":
      return "user-profile-presence-dot user-profile-presence-dot--offline";
    default:
      return "user-profile-presence-dot user-profile-presence-dot--online";
  }
}

function profileAccentVars(profile: UserProfile): CSSProperties {
  const accent = profile.displayRole?.color ?? "#2dd4bf";
  return {
    "--profile-accent": accent,
    "--profile-accent-dim": `color-mix(in srgb, ${accent} 28%, transparent)`,
    "--profile-accent-glow": `color-mix(in srgb, ${accent} 45%, transparent)`,
  } as CSSProperties;
}

function profileTag(profile: UserProfile): string {
  if (profile.isOwner) {
    return "FOUNDER";
  }
  if (profile.friendshipStatus === "friends") {
    return "LINKED";
  }
  if (profile.friendshipStatus === "pending_outgoing") {
    return "PENDING";
  }
  if (profile.friendshipStatus === "pending_incoming") {
    return "INCOMING";
  }
  return "MEMBER";
}

function presenceSignalLabel(status: string | undefined, customStatus: string | null | undefined): string {
  if (customStatus?.trim()) {
    return customStatus.trim();
  }
  switch (status) {
    case "idle":
      return "IDLE";
    case "dnd":
      return "DND";
    case "invisible":
      return "OFFLINE";
    default:
      return "ONLINE";
  }
}

function formatMemberSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M4.5 4h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4.6l-3.7 2.8a1 1 0 0 1-1.6-.8V17H4.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M15 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-9 8a7 7 0 1 1 14 0H6Zm16-5v2h-3v3h-2v-3h-3v-2h3V9h2v5h3Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2Z" />
    </svg>
  );
}

export default function UserProfilePopover({
  userId,
  serverId,
  anchorRect,
  onClose,
  onMessage,
  onMemberUpdated,
}: UserProfilePopoverProps) {
  const { user: currentUser } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [viewExpanded, setViewExpanded] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const isSelf = currentUser?.id === userId;
  const isOwner = Boolean(profile?.isOwner);
  const canManageNicknames =
    Boolean(serverId) &&
    !isSelf &&
    (permissions?.manage_nicknames || permissions?.administrator);
  const canKick =
    Boolean(serverId) &&
    !isSelf &&
    !isOwner &&
    (permissions?.kick_members || permissions?.administrator);
  const canBan =
    Boolean(serverId) &&
    !isSelf &&
    !isOwner &&
    (permissions?.ban_members || permissions?.administrator);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResponse, permissionsResponse] = await Promise.all([
        getUserProfile(userId, serverId),
        serverId ? getMyPermissions(serverId) : Promise.resolve(null),
      ]);
      setProfile(profileResponse.profile);
      setNicknameDraft(profileResponse.profile.nickname ?? "");
      setPermissions(permissionsResponse?.permissions ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [serverId, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const cardWidth = card?.offsetWidth ?? 320;
    const cardHeight = card?.offsetHeight ?? 420;
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.left - cardWidth - margin;
    if (left < margin) {
      left = anchorRect.right + margin;
    }
    if (left + cardWidth > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - cardWidth - margin);
    }

    let top = anchorRect.top;
    if (top + cardHeight > viewportHeight - margin) {
      top = Math.max(margin, viewportHeight - cardHeight - margin);
    }

    setPosition({ top, left });
  }, [anchorRect, loading, profile, editingNickname, viewExpanded, messageDraft]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function handleSaveNickname() {
    if (!serverId || !canManageNicknames) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const trimmed = nicknameDraft.trim();
      await setMemberNickname(serverId, userId, trimmed || null);
      setEditingNickname(false);
      await loadProfile();
      onMemberUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update nickname.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFriend() {
    if (!profile || isSelf) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await sendFriendRequest(profile.username);
      setProfile((current) =>
        current ? { ...current, friendshipStatus: "pending_outgoing" } : current,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not send friend request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptFriend() {
    if (!profile?.incomingFriendRequestId) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await acceptFriendRequest(profile.incomingFriendRequestId);
      setProfile((current) =>
        current
          ? {
              ...current,
              friendshipStatus: "friends",
              incomingFriendRequestId: null,
            }
          : current,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not accept friend request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickMessage(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = messageDraft.trim();
    if (!trimmed || isSelf) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const response = await openDm(userId);
      await sendDmMessage(response.channelId, trimmed);
      setMessageDraft("");
      onMessage?.(userId);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  async function handleKick() {
    if (!serverId || !canKick) {
      return;
    }
    if (!window.confirm(`Remove ${profile?.serverDisplayName ?? profile?.username} from the server?`)) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await kickMember(serverId, userId);
      onMemberUpdated?.();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBan() {
    if (!serverId || !canBan) {
      return;
    }
    const reason = window.prompt("Ban reason (optional):") ?? "";
    if (reason === null) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await banMember(serverId, userId, reason);
      onMemberUpdated?.();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not ban member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTimeout() {
    if (!serverId || !canKick) {
      return;
    }
    const minutes = Number(window.prompt("Timeout duration in minutes:", "10"));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await timeoutMember(serverId, userId, minutes);
      onMemberUpdated?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not timeout member.");
    } finally {
      setBusy(false);
    }
  }

  const displayName =
    profile?.serverDisplayName || profile?.displayName || profile?.username || "User";
  const presenceStatus = profile?.presence?.status ?? (profile?.isOnline ? "online" : "invisible");

  return createPortal(
    <div
      ref={cardRef}
      className={`user-profile-popover${viewExpanded ? " user-profile-popover--expanded" : ""}`}
      style={{ top: position.top, left: position.left, ...(profile ? profileAccentVars(profile) : undefined) }}
      role="dialog"
      aria-label={`${displayName} profile`}
    >
      {loading && !profile ? (
        <div className="user-profile-popover-loading">Loading profile…</div>
      ) : error && !profile ? (
        <div className="user-profile-popover-error">{error}</div>
      ) : profile ? (
        <>
          <div className="user-profile-popover-chrome" aria-hidden="true">
            <span className="user-profile-popover-corner user-profile-popover-corner--tl" />
            <span className="user-profile-popover-corner user-profile-popover-corner--tr" />
            <span className="user-profile-popover-corner user-profile-popover-corner--bl" />
            <span className="user-profile-popover-corner user-profile-popover-corner--br" />
          </div>

          <div
            className="user-profile-popover-hud"
            style={profileAccentVars(profile)}
            aria-hidden="true"
          >
            <div className="user-profile-popover-hud-grid" />
            <div className="user-profile-popover-hud-glow" />
            <div className="user-profile-popover-hud-scan" />
          </div>

          <div className="user-profile-popover-body">
            <div className="user-profile-popover-identity">
              <div className="user-profile-popover-avatar-frame">
                <UserAvatar
                  username={profile.username}
                  avatarUrl={profile.avatarUrl}
                  size="profile"
                  className="user-profile-popover-avatar"
                />
                <span className={`user-profile-popover-presence-ring ${presenceClass(presenceStatus)}`} aria-hidden="true" />
              </div>

              <div className="user-profile-popover-id-block">
                <div className="user-profile-popover-id-meta">
                  <span className="user-profile-popover-tag">{profileTag(profile)}</span>
                  {profile.displayRole && (
                    <span
                      className="user-profile-popover-rank-tag"
                      style={{ color: profile.displayRole.color, borderColor: profile.displayRole.color }}
                    >
                      {profile.displayRole.name}
                    </span>
                  )}
                </div>
                <h3
                  className="user-profile-popover-display-name"
                  style={profile.displayRole ? { color: profile.displayRole.color } : undefined}
                >
                  {displayName}
                </h3>
                <p className="user-profile-popover-username">
                  <span className="user-profile-popover-handle-prefix">@</span>
                  {profile.username}
                </p>
                <div className="user-profile-popover-signal">
                  <span className={`user-profile-popover-signal-dot ${presenceClass(presenceStatus)}`} aria-hidden="true" />
                  <span className="user-profile-popover-signal-label">
                    SIGNAL<span className="user-profile-popover-signal-sep">::</span>
                    {presenceSignalLabel(profile.presence?.status, profile.presence?.customStatus)}
                  </span>
                </div>
              </div>
            </div>

            {!isSelf && (
              <div className="user-profile-popover-toolbar">
                {onMessage && (
                  <button
                    type="button"
                    className="user-profile-popover-tool"
                    title="Open direct messages"
                    disabled={busy}
                    onClick={() => {
                      onMessage(userId);
                      onClose();
                    }}
                  >
                    <MessageIcon />
                    <span>Uplink</span>
                  </button>
                )}
                {profile.friendshipStatus === "none" && (
                  <button
                    type="button"
                    className="user-profile-popover-tool"
                    title="Add friend"
                    disabled={busy}
                    onClick={() => void handleAddFriend()}
                  >
                    <UserPlusIcon />
                    <span>Connect</span>
                  </button>
                )}
                {profile.friendshipStatus === "pending_outgoing" && (
                  <button type="button" className="user-profile-popover-tool" disabled title="Request sent">
                    <UserPlusIcon />
                    <span>Sent</span>
                  </button>
                )}
                {profile.friendshipStatus === "pending_incoming" && (
                  <button
                    type="button"
                    className="user-profile-popover-tool user-profile-popover-tool--accent"
                    title="Accept friend request"
                    disabled={busy}
                    onClick={() => void handleAcceptFriend()}
                  >
                    <UserPlusIcon />
                    <span>Accept</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`user-profile-popover-tool${viewExpanded ? " active" : ""}`}
                  title="View profile details"
                  disabled={busy}
                  onClick={() => setViewExpanded((value) => !value)}
                >
                  <ProfileIcon />
                  <span>Dossier</span>
                </button>
              </div>
            )}

            {profile.roles.length > 0 && (
              <div className="user-profile-popover-roles">
                <span className="user-profile-popover-roles-label">Clearance</span>
                <div className="user-profile-popover-role-list">
                  {profile.roles.map((role) => (
                    <span
                      key={role.id}
                      className="user-profile-popover-role-chip"
                      style={
                        {
                          "--role-color": role.color,
                          borderColor: role.color,
                          color: role.color,
                        } as CSSProperties
                      }
                    >
                      <span className="user-profile-popover-role-dot" style={{ background: role.color }} />
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {viewExpanded && (
              <div className="user-profile-popover-details">
                <span className="user-profile-popover-roles-label">Telemetry</span>
                <div className="user-profile-popover-detail-row">
                  <span className="user-profile-popover-detail-label">Display</span>
                  <span>{profile.displayName}</span>
                </div>
                <div className="user-profile-popover-detail-row">
                  <span className="user-profile-popover-detail-label">Handle</span>
                  <span>@{profile.username}</span>
                </div>
                {profile.nickname && (
                  <div className="user-profile-popover-detail-row">
                    <span className="user-profile-popover-detail-label">Alias</span>
                    <span>{profile.nickname}</span>
                  </div>
                )}
                {profile.joinedAt && (
                  <div className="user-profile-popover-detail-row">
                    <span className="user-profile-popover-detail-label">Joined</span>
                    <span>{formatMemberSince(profile.joinedAt)}</span>
                  </div>
                )}
              </div>
            )}

            {!viewExpanded && profile.joinedAt && serverId && (
              <div className="user-profile-popover-member-since">
                <span className="user-profile-popover-detail-label">Joined</span>
                <span className="user-profile-popover-member-since-value">{formatMemberSince(profile.joinedAt)}</span>
              </div>
            )}

            {editingNickname && canManageNicknames && (
              <div className="user-profile-popover-nickname-edit">
                <input
                  type="text"
                  value={nicknameDraft}
                  maxLength={32}
                  disabled={busy}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  placeholder="Set a nickname"
                />
                <div className="user-profile-popover-nickname-actions">
                  <button type="button" disabled={busy} onClick={() => void handleSaveNickname()}>
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingNickname(false);
                      setNicknameDraft(profile.nickname ?? "");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {actionError && <p className="user-profile-popover-action-error">{actionError}</p>}

            {(canManageNicknames || canKick || canBan) && (
              <div className="user-profile-popover-mod-actions">
                {canManageNicknames && !editingNickname && (
                  <button
                    type="button"
                    className="user-profile-popover-action"
                    disabled={busy}
                    onClick={() => setEditingNickname(true)}
                  >
                    Set Nickname
                  </button>
                )}
                {canKick && (
                  <>
                    <button
                      type="button"
                      className="user-profile-popover-action user-profile-popover-action--warn"
                      disabled={busy}
                      onClick={() => void handleTimeout()}
                    >
                      Timeout
                    </button>
                    <button
                      type="button"
                      className="user-profile-popover-action user-profile-popover-action--warn"
                      disabled={busy}
                      onClick={() => void handleKick()}
                    >
                      Kick
                    </button>
                  </>
                )}
                {canBan && (
                  <button
                    type="button"
                    className="user-profile-popover-action user-profile-popover-action--danger"
                    disabled={busy}
                    onClick={() => void handleBan()}
                  >
                    Ban
                  </button>
                )}
              </div>
            )}

            {!isSelf && (
              <form className="user-profile-popover-compose" onSubmit={(event) => void handleQuickMessage(event)}>
                <span className="user-profile-popover-compose-prompt" aria-hidden="true">&gt;</span>
                <input
                  type="text"
                  value={messageDraft}
                  disabled={busy}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder={`uplink @${profile.username}`}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  className="user-profile-popover-compose-send"
                  disabled={busy || !messageDraft.trim()}
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </form>
            )}
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
