import { useEffect, useMemo, useState } from "react";
import {
  getFriends,
  getOnlineMembers,
  getServerMembers,
  sendVoiceInvite,
  type FriendUser,
  type OnlineMember,
  type ServerMember,
} from "../lib/api";
import UserAvatar from "./UserAvatar";

type InviteTab = "friends" | "members";

interface InviteCandidate {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  subtitle?: string;
  online?: boolean;
}

interface VoiceInviteModalProps {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  inviteCode?: string;
  currentUserId: string;
  excludeUserIds?: string[];
  onClose: () => void;
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8v2m9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5"
      />
    </svg>
  );
}

export default function VoiceInviteModal({
  serverId,
  serverName,
  channelId,
  channelName,
  inviteCode,
  currentUserId,
  excludeUserIds = [],
  onClose,
}: VoiceInviteModalProps) {
  const [tab, setTab] = useState<InviteTab>("friends");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const excluded = useMemo(() => new Set([currentUserId, ...excludeUserIds]), [currentUserId, excludeUserIds]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [friendsResponse, membersResponse, onlineResponse] = await Promise.all([
          getFriends(),
          getServerMembers(serverId),
          getOnlineMembers(serverId).catch(() => ({ members: [] as OnlineMember[] })),
        ]);

        if (cancelled) {
          return;
        }

        setFriends(friendsResponse.friends);
        setMembers(membersResponse.members);
        setOnlineIds(new Set(onlineResponse.members.map((member) => member.userId)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load invite list.");
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

  const candidates = useMemo((): InviteCandidate[] => {
    const query = search.trim().toLowerCase();

    if (tab === "friends") {
      return friends
        .filter((friend) => !excluded.has(friend.userId))
        .filter((friend) => {
          if (!query) {
            return true;
          }
          return (
            friend.username.toLowerCase().includes(query) ||
            friend.displayName.toLowerCase().includes(query)
          );
        })
        .map((friend) => ({
          userId: friend.userId,
          username: friend.username,
          displayName: friend.displayName,
          avatarUrl: friend.avatarUrl,
          subtitle: "Friend",
          online: onlineIds.has(friend.userId),
        }));
    }

    return members
      .filter((member) => !excluded.has(member.userId))
      .filter((member) => {
        if (!query) {
          return true;
        }
        const nickname = member.nickname?.toLowerCase() ?? "";
        return (
          member.username.toLowerCase().includes(query) ||
          member.displayName.toLowerCase().includes(query) ||
          nickname.includes(query)
        );
      })
      .map((member) => ({
        userId: member.userId,
        username: member.username,
        displayName: member.nickname?.trim() || member.displayName,
        avatarUrl: member.avatarUrl ?? null,
        subtitle: member.isOwner ? "Server owner" : "Server member",
        online: onlineIds.has(member.userId),
      }));
  }, [tab, friends, members, search, excluded, onlineIds]);

  async function handleInvite(userId: string) {
    setSendingId(userId);
    setError(null);
    try {
      await sendVoiceInvite(serverId, channelId, userId);
      setSentIds((current) => new Set(current).add(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setSendingId(null);
    }
  }

  async function copyInviteLink() {
    const link = inviteCode
      ? `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`
      : window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setInviteCopied(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="channel-settings-modal app-modal--tall"
        role="dialog"
        aria-label={`Invite to ${channelName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="channel-settings-header">
          <div>
            <h2>Invite to Voice</h2>
            <p className="settings-muted">
              Invite friends or members to <strong>{channelName}</strong> in {serverName}
            </p>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="app-modal-tabs">
          <button
            type="button"
            className={tab === "friends" ? "active" : ""}
            onClick={() => setTab("friends")}
          >
            Friends
          </button>
          <button
            type="button"
            className={tab === "members" ? "active" : ""}
            onClick={() => setTab("members")}
          >
            Server Members
          </button>
        </div>

        <div className="app-modal-search-wrap">
          <input
            type="search"
            placeholder={tab === "friends" ? "Search friends" : "Search members"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {error && <div className="settings-error app-modal-error">{error}</div>}

        <div className="app-modal-body" aria-busy={loading}>
          {loading ? (
            <p className="app-modal-empty">Loading...</p>
          ) : candidates.length === 0 ? (
            <p className="app-modal-empty">
              {tab === "friends"
                ? "No friends to invite. Add friends from the Friends panel first."
                : "No server members match your search."}
            </p>
          ) : (
            candidates.map((candidate) => {
              const sent = sentIds.has(candidate.userId);
              const sending = sendingId === candidate.userId;

              return (
                <div key={candidate.userId} className="app-modal-row">
                  <UserAvatar
                    username={candidate.username}
                    avatarUrl={candidate.avatarUrl}
                    size="reply"
                  />
                  <div className="app-modal-row-text">
                    <span className="app-modal-row-name">
                      {candidate.displayName}
                      {candidate.online && <span className="app-modal-online-dot" title="Online" />}
                    </span>
                    <span className="app-modal-row-meta">
                      @{candidate.username}
                      {candidate.subtitle ? ` · ${candidate.subtitle}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`primary-button primary-button--compact${sent ? " sent" : ""}`}
                    disabled={sent || sending}
                    onClick={() => void handleInvite(candidate.userId)}
                  >
                    {sent ? "Sent" : sending ? "Sending..." : "Invite"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <footer className="app-modal-footer">
          <button type="button" className="secondary-button" onClick={() => void copyInviteLink()}>
            <LinkIcon />
            {inviteCopied ? "Link copied!" : "Copy invite link"}
          </button>
        </footer>
      </div>
    </div>
  );
}
