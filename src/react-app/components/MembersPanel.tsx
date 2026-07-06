import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import UserAvatar from "./UserAvatar";
import UserProfilePopover from "./UserProfilePopover";
import { UsersIcon } from "./UiIcons";
import { useOnlineMembers } from "../hooks/useOnlineMembers";
import { getServerMembers, type OnlineMember, type ServerMember } from "../lib/api";

interface MembersPanelProps {
  serverId: string | null;
  serverName: string | null;
  currentUserId: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onOpenDm?: (userId: string) => void;
}

interface ProfileAnchor {
  userId: string;
  rect: DOMRect;
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function memberMatchesQuery(
  member: { username: string; displayName: string; nickname?: string | null },
  query: string,
): boolean {
  const haystack = [
    member.username,
    member.displayName,
    member.nickname ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function MemberRow({
  username,
  displayName,
  avatarUrl,
  displayRole,
  isOnline,
  onClick,
}: {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  displayRole: { name: string; color: string } | null;
  isOnline: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <li className={`members-list-item${isOnline ? "" : " members-list-item--offline"}`}>
      <button type="button" className="members-list-button" onClick={onClick}>
        <div className="members-online-avatar-wrap">
          <UserAvatar
            username={username}
            avatarUrl={avatarUrl}
            size="sidebar"
            className="members-online-avatar"
          />
          {isOnline && <span className="members-online-status" aria-hidden="true" />}
        </div>
        <div className="members-online-meta">
          <span
            className="members-online-name"
            style={displayRole ? { color: displayRole.color } : undefined}
            title={displayName || username}
          >
            {displayName || username}
          </span>
          {displayRole && (
            <span className="members-online-role" style={{ color: displayRole.color }}>
              {displayRole.name}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

export default function MembersPanel({
  serverId,
  serverName,
  currentUserId,
  collapsed = false,
  onToggleCollapsed,
  onOpenDm,
}: MembersPanelProps) {
  const { members: onlineMembers, onlineCount, loading: onlineLoading, error: onlineError, refresh: refreshOnline } =
    useOnlineMembers(serverId);
  const [allMembers, setAllMembers] = useState<ServerMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileAnchor, setProfileAnchor] = useState<ProfileAnchor | null>(null);

  const loadAllMembers = useCallback(async () => {
    if (!serverId) {
      setAllMembers([]);
      return;
    }

    setMembersLoading(true);
    setMembersError(null);
    try {
      const response = await getServerMembers(serverId);
      setAllMembers(response.members);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Could not load members.");
    } finally {
      setMembersLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void loadAllMembers();
  }, [loadAllMembers]);

  const onlineByUserId = useMemo(() => {
    const map = new Map<string, OnlineMember>();
    for (const member of onlineMembers) {
      map.set(member.userId, member);
    }
    return map;
  }, [onlineMembers]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredOnline = useMemo(() => {
    if (!normalizedQuery) {
      return onlineMembers;
    }
    return onlineMembers.filter((member) => memberMatchesQuery(member, normalizedQuery));
  }, [normalizedQuery, onlineMembers]);

  const offlineMembers = useMemo(() => {
    const offline = allMembers.filter((member) => !onlineByUserId.has(member.userId));
    if (!normalizedQuery) {
      return offline;
    }
    return offline.filter((member) => memberMatchesQuery(member, normalizedQuery));
  }, [allMembers, normalizedQuery, onlineByUserId]);

  const totalCount = allMembers.length;
  const loading = onlineLoading || membersLoading;
  const error = onlineError ?? membersError;

  function handleMemberClick(userId: string, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setProfileAnchor({ userId, rect });
  }

  function handleMemberUpdated() {
    void refreshOnline();
    void loadAllMembers();
  }

  if (collapsed) {
    return (
      <aside className="members-sidebar members-sidebar-collapsed" aria-label="Members">
        <button
          type="button"
          className="members-sidebar-expand"
          onClick={onToggleCollapsed}
          title="Show member list"
          aria-label="Show member list"
        >
          <UsersIcon />
          {!loading && <span className="members-sidebar-expand-count">{totalCount || onlineCount}</span>}
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside className="members-sidebar" aria-label="Members">
        <header className="members-sidebar-header">
          <div className="members-sidebar-header-text">
            <h2>{serverName ?? "Server"}</h2>
            <span className="members-online-count">
              Members — {loading && totalCount === 0 ? "…" : totalCount}
            </span>
          </div>
          {onToggleCollapsed && (
            <button
              type="button"
              className="icon-button icon-button-sm members-sidebar-collapse"
              onClick={onToggleCollapsed}
              title="Hide member list"
              aria-label="Hide member list"
            >
              <CollapseIcon />
            </button>
          )}
        </header>

        <div className="members-sidebar-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
          />
        </div>

        <div className="members-sidebar-body">
          {error && <p className="members-sidebar-error">{error}</p>}

          <section className="members-list-section">
            <h3 className="members-list-heading">
              Online — {onlineLoading && filteredOnline.length === 0 ? "…" : filteredOnline.length}
            </h3>
            {!error && !loading && filteredOnline.length === 0 && (
              <p className="members-sidebar-empty">No matching members online.</p>
            )}
            <ul className="members-online-list">
              {filteredOnline.map((member) => (
                <MemberRow
                  key={member.userId}
                  username={member.username}
                  displayName={member.displayName}
                  avatarUrl={member.avatarUrl}
                  displayRole={member.displayRole}
                  isOnline
                  onClick={(event) => handleMemberClick(member.userId, event)}
                />
              ))}
            </ul>
          </section>

          <section className="members-list-section members-list-section--offline">
            <h3 className="members-list-heading">
              Offline — {membersLoading && offlineMembers.length === 0 ? "…" : offlineMembers.length}
            </h3>
            {!error && !membersLoading && offlineMembers.length === 0 && (
              <p className="members-sidebar-empty">No matching offline members.</p>
            )}
            <ul className="members-online-list members-offline-list">
              {offlineMembers.map((member) => {
                const displayName = member.nickname?.trim() || member.displayName;
                return (
                  <MemberRow
                    key={member.userId}
                    username={member.username}
                    displayName={displayName}
                    avatarUrl={member.avatarUrl ?? null}
                    displayRole={
                      member.displayRole ??
                      (member.isOwner ? { name: "Owner", color: "#f1c40f" } : null)
                    }
                    isOnline={false}
                    onClick={(event) => handleMemberClick(member.userId, event)}
                  />
                );
              })}
            </ul>
          </section>
        </div>
      </aside>

      {profileAnchor && (
        <UserProfilePopover
          userId={profileAnchor.userId}
          serverId={serverId}
          anchorRect={profileAnchor.rect}
          onClose={() => setProfileAnchor(null)}
          onMessage={profileAnchor.userId === currentUserId ? undefined : onOpenDm}
          onMemberUpdated={handleMemberUpdated}
        />
      )}
    </>
  );
}
