import {
  mapRoleRow,
  rankOnlineMembers,
  type MemberRoleInfo,
  type RankedOnlineMember,
} from "./member-ranking";
import { shouldShowActivityStatus } from "./privacy";

export const PRESENCE_ONLINE_SECONDS = 90;

export async function touchServerPresence(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO server_presence (server_id, user_id, last_seen_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(server_id, user_id)
       DO UPDATE SET last_seen_at = datetime('now')`,
    )
    .bind(serverId, userId)
    .run();
}

export async function getOnlineServerMembers(
  db: D1Database,
  serverId: string,
  ownerId: string,
): Promise<RankedOnlineMember[]> {
  const membersResult = await db
    .prepare(
      `SELECT sm.user_id, u.username, u.display_name, u.avatar_url,
              CASE WHEN s.owner_id = sm.user_id THEN 1 ELSE 0 END AS is_owner
       FROM server_members sm
       INNER JOIN users u ON u.id = sm.user_id
       INNER JOIN servers s ON s.id = sm.server_id
       INNER JOIN server_presence sp
         ON sp.server_id = sm.server_id
        AND sp.user_id = sm.user_id
       WHERE sm.server_id = ?
         AND sp.last_seen_at >= datetime('now', ?)`,
    )
    .bind(serverId, `-${PRESENCE_ONLINE_SECONDS} seconds`)
    .all<{
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      is_owner: number;
    }>();

  const members = membersResult.results ?? [];
  if (members.length === 0) {
    return [];
  }

  const rolesResult = await db
    .prepare(
      `SELECT id, name, color, position, permissions, is_everyone
       FROM server_roles
       WHERE server_id = ?`,
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
  const roleById = new Map(roleRows.map((row) => [row.id, mapRoleRow(row)]));
  const everyoneRole =
    roleRows.map((row) => mapRoleRow(row)).find((role) => role.isEveryone) ?? null;

  const assignmentsResult = await db
    .prepare(
      `SELECT user_id, role_id
       FROM member_roles
       WHERE server_id = ?`,
    )
    .bind(serverId)
    .all<{ user_id: string; role_id: string }>();

  const assignments = (assignmentsResult.results ?? [])
    .map((row) => {
      const role = roleById.get(row.role_id);
      if (!role) {
        return null;
      }
      return { user_id: row.user_id, role };
    })
    .filter((row): row is { user_id: string; role: MemberRoleInfo } => row !== null);

  return rankOnlineMembers(
    members.map((member) => ({
      userId: member.user_id,
      username: member.username,
      displayName: member.display_name,
      avatarUrl: member.avatar_url ? `/api/auth/avatars/${member.user_id}` : null,
      isOwner: member.is_owner === 1,
    })),
    assignments,
    everyoneRole,
    ownerId,
  );
}

export interface RankedServerMember extends RankedOnlineMember {
  membershipId: string;
  nickname: string | null;
  joinedAt: string;
}

export async function getAllRankedServerMembers(
  db: D1Database,
  serverId: string,
  ownerId: string,
): Promise<RankedServerMember[]> {
  const membersResult = await db
    .prepare(
      `SELECT sm.id AS membership_id, sm.user_id, sm.nickname, sm.joined_at,
              u.username, u.display_name, u.avatar_url,
              CASE WHEN s.owner_id = sm.user_id THEN 1 ELSE 0 END AS is_owner
       FROM server_members sm
       INNER JOIN users u ON u.id = sm.user_id
       INNER JOIN servers s ON s.id = sm.server_id
       WHERE sm.server_id = ?
       ORDER BY is_owner DESC, sm.joined_at ASC`,
    )
    .bind(serverId)
    .all<{
      membership_id: string;
      user_id: string;
      nickname: string | null;
      joined_at: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      is_owner: number;
    }>();

  const members = membersResult.results ?? [];
  if (members.length === 0) {
    return [];
  }

  const rolesResult = await db
    .prepare(
      `SELECT id, name, color, position, permissions, is_everyone
       FROM server_roles
       WHERE server_id = ?`,
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
  const roleById = new Map(roleRows.map((row) => [row.id, mapRoleRow(row)]));
  const everyoneRole =
    roleRows.map((row) => mapRoleRow(row)).find((role) => role.isEveryone) ?? null;

  const assignmentsResult = await db
    .prepare(`SELECT user_id, role_id FROM member_roles WHERE server_id = ?`)
    .bind(serverId)
    .all<{ user_id: string; role_id: string }>();

  const assignments = (assignmentsResult.results ?? [])
    .map((row) => {
      const role = roleById.get(row.role_id);
      if (!role) {
        return null;
      }
      return { user_id: row.user_id, role };
    })
    .filter((row): row is { user_id: string; role: MemberRoleInfo } => row !== null);

  const ranked = rankOnlineMembers(
    members.map((member) => ({
      userId: member.user_id,
      username: member.username,
      displayName: member.display_name,
      avatarUrl: member.avatar_url ? `/api/auth/avatars/${member.user_id}` : null,
      isOwner: member.is_owner === 1,
    })),
    assignments,
    everyoneRole,
    ownerId,
  );

  const metaByUserId = new Map(
    members.map((member) => [
      member.user_id,
      {
        membershipId: member.membership_id,
        nickname: member.nickname,
        joinedAt: member.joined_at,
      },
    ]),
  );

  return ranked.map((member) => {
    const meta = metaByUserId.get(member.userId)!;
    return {
      ...member,
      membershipId: meta.membershipId,
      nickname: meta.nickname,
      joinedAt: meta.joinedAt,
    };
  });
}

export async function getVisibleOnlineServerMembers(
  db: D1Database,
  serverId: string,
  ownerId: string,
): Promise<RankedOnlineMember[]> {
  const members = await getOnlineServerMembers(db, serverId, ownerId);
  const visible: RankedOnlineMember[] = [];

  for (const member of members) {
    if (await shouldShowActivityStatus(db, member.userId)) {
      visible.push(member);
    }
  }

  return visible;
}
