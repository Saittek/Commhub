import { getDisplayNameInServer, getUserPresence, type PresenceStatus } from "./discord-features";
import {
  mapRoleRow,
  pickDisplayRole,
  rolesForMember,
  type MemberRoleInfo,
} from "./member-ranking";
import { PRESENCE_ONLINE_SECONDS } from "./presence";
import { shouldShowActivityStatus } from "./privacy";
import { getUserRow } from "./users";

async function areFriends(db: D1Database, userId: string, otherUserId: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM friendships WHERE user_id = ? AND friend_user_id = ? LIMIT 1",
    )
    .bind(userId, otherUserId)
    .first();

  return Boolean(row);
}

async function shareServer(db: D1Database, userId: string, otherUserId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM server_members sm1
       INNER JOIN server_members sm2 ON sm1.server_id = sm2.server_id
       WHERE sm1.user_id = ? AND sm2.user_id = ?
       LIMIT 1`,
    )
    .bind(userId, otherUserId)
    .first();

  return Boolean(row);
}

async function getFriendshipStatus(
  db: D1Database,
  viewerId: string,
  targetUserId: string,
): Promise<{
  status: UserProfileDto["friendshipStatus"];
  incomingFriendRequestId: string | null;
}> {
  if (viewerId === targetUserId) {
    return { status: "self", incomingFriendRequestId: null };
  }

  if (await areFriends(db, viewerId, targetUserId)) {
    return { status: "friends", incomingFriendRequestId: null };
  }

  const outgoing = await db
    .prepare(
      "SELECT 1 FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    )
    .bind(viewerId, targetUserId)
    .first();

  if (outgoing) {
    return { status: "pending_outgoing", incomingFriendRequestId: null };
  }

  const incoming = await db
    .prepare(
      "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
    )
    .bind(targetUserId, viewerId)
    .first<{ id: string }>();

  if (incoming) {
    return { status: "pending_incoming", incomingFriendRequestId: incoming.id };
  }

  return { status: "none", incomingFriendRequestId: null };
}

export interface UserProfileDto {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  nickname: string | null;
  serverDisplayName: string | null;
  roles: Array<{ id: string; name: string; color: string }>;
  displayRole: { name: string; color: string } | null;
  presence: { status: PresenceStatus; customStatus: string | null } | null;
  isOnline: boolean | null;
  isOwner: boolean | null;
  joinedAt: string | null;
  friendshipStatus: "self" | "friends" | "pending_outgoing" | "pending_incoming" | "none";
  incomingFriendRequestId: string | null;
}

export async function buildUserProfile(
  db: D1Database,
  targetUserId: string,
  options: { viewerId: string; serverId?: string | null },
): Promise<UserProfileDto | null> {
  const row = await getUserRow(db, targetUserId);
  if (!row) {
    return null;
  }

  const profile: UserProfileDto = {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ? `/api/auth/avatars/${row.id}` : null,
    nickname: null,
    serverDisplayName: null,
    roles: [],
    displayRole: null,
    presence: null,
    isOnline: null,
    isOwner: null,
    joinedAt: null,
    friendshipStatus: "none",
    incomingFriendRequestId: null,
  };

  const friendship = await getFriendshipStatus(db, options.viewerId, targetUserId);
  profile.friendshipStatus = friendship.status;
  profile.incomingFriendRequestId = friendship.incomingFriendRequestId;

  const canSeePresence =
    options.viewerId === targetUserId ||
    (await areFriends(db, options.viewerId, targetUserId)) ||
    (await shareServer(db, options.viewerId, targetUserId));

  const showPresence =
    canSeePresence &&
    (options.viewerId === targetUserId || (await shouldShowActivityStatus(db, targetUserId)));

  if (showPresence) {
    const presence = await getUserPresence(db, targetUserId);
    profile.presence = {
      status: presence.status,
      customStatus: presence.customStatus,
    };
  }

  if (!options.serverId) {
    return profile;
  }

  const serverId = options.serverId;
  const memberRow = await db
    .prepare(
      `SELECT sm.nickname, sm.joined_at,
              CASE WHEN s.owner_id = sm.user_id THEN 1 ELSE 0 END AS is_owner,
              s.owner_id
       FROM server_members sm
       INNER JOIN servers s ON s.id = sm.server_id
       WHERE sm.server_id = ? AND sm.user_id = ? LIMIT 1`,
    )
    .bind(serverId, targetUserId)
    .first<{
      nickname: string | null;
      joined_at: string;
      is_owner: number;
      owner_id: string;
    }>();

  if (!memberRow) {
    return profile;
  }

  profile.nickname = memberRow.nickname?.trim() || null;
  profile.serverDisplayName = await getDisplayNameInServer(
    db,
    serverId,
    targetUserId,
    row.display_name,
  );
  profile.isOwner = memberRow.is_owner === 1;
  profile.joinedAt = memberRow.joined_at;

  const onlineRow = await db
    .prepare(
      `SELECT 1 FROM server_presence
       WHERE server_id = ? AND user_id = ?
         AND last_seen_at >= datetime('now', ?)
       LIMIT 1`,
    )
    .bind(serverId, targetUserId, `-${PRESENCE_ONLINE_SECONDS} seconds`)
    .first();

  profile.isOnline = Boolean(onlineRow) && showPresence;

  const rolesResult = await db
    .prepare(
      `SELECT id, name, color, position, permissions, is_everyone
       FROM server_roles WHERE server_id = ?`,
    )
    .bind(serverId)
    .all<{
      id: string;
      name: string;
      color: string;
      position: number;
      permissions: string;
      is_everyone: number;
    }>();

  const roleRows = rolesResult.results ?? [];
  const roleById = new Map(roleRows.map((roleRow) => [roleRow.id, mapRoleRow(roleRow)]));
  const everyoneRole =
    roleRows.map((roleRow) => mapRoleRow(roleRow)).find((role) => role.isEveryone) ?? null;

  const assignmentsResult = await db
    .prepare("SELECT user_id, role_id FROM member_roles WHERE server_id = ?")
    .bind(serverId)
    .all<{ user_id: string; role_id: string }>();

  const assignments = (assignmentsResult.results ?? [])
    .map((assignment) => {
      const role = roleById.get(assignment.role_id);
      if (!role) {
        return null;
      }
      return { user_id: assignment.user_id, role };
    })
    .filter((assignment): assignment is { user_id: string; role: MemberRoleInfo } =>
      Boolean(assignment),
    );

  const memberRoles = rolesForMember(targetUserId, assignments, everyoneRole)
    .filter((role) => !role.isEveryone)
    .sort((left, right) => right.position - left.position);

  profile.roles = memberRoles.map((role) => ({
    id: role.id,
    name: role.name,
    color: role.color,
  }));
  profile.displayRole = pickDisplayRole(
    rolesForMember(targetUserId, assignments, everyoneRole),
    profile.isOwner,
  );

  return profile;
}
