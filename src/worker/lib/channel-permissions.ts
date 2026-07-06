import {
  ALL_PERMISSION_KEYS,
  FULL_PERMISSIONS,
  hasPermission,
  parsePermissions,
  type PermissionKey,
  type RolePermissions,
} from "./permissions";
import { getMemberPermissions } from "./user-permissions";

export interface ChannelOverwriteRow {
  id: string;
  channel_id: string;
  target_type: "role" | "member";
  target_id: string;
  allow_permissions: string;
  deny_permissions: string;
}

export interface ChannelOverwriteDto {
  id: string;
  channelId: string;
  targetType: "role" | "member";
  targetId: string;
  allow: RolePermissions;
  deny: RolePermissions;
}

function applyOverwrites(
  base: RolePermissions,
  overwrites: Array<{ allow: RolePermissions; deny: RolePermissions }>,
): RolePermissions {
  if (base.administrator) {
    return { ...FULL_PERMISSIONS };
  }

  const result: RolePermissions = { ...base };

  for (const overwrite of overwrites) {
    for (const key of ALL_PERMISSION_KEYS) {
      if (overwrite.deny[key]) {
        result[key] = false;
      }
    }
    for (const key of ALL_PERMISSION_KEYS) {
      if (overwrite.allow[key]) {
        result[key] = true;
      }
    }
  }

  return result;
}

export async function getChannelOverwrites(
  db: D1Database,
  channelId: string,
): Promise<ChannelOverwriteDto[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT id, channel_id, target_type, target_id, allow_permissions, deny_permissions
         FROM channel_permission_overwrites WHERE channel_id = ?`,
      )
      .bind(channelId)
      .all<ChannelOverwriteRow>();

    return (rows.results ?? []).map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      targetType: row.target_type,
      targetId: row.target_id,
      allow: parsePermissions(row.allow_permissions),
      deny: parsePermissions(row.deny_permissions),
    }));
  } catch {
    return [];
  }
}

export async function getChannelMemberPermissions(
  db: D1Database,
  serverId: string,
  channelId: string,
  userId: string,
  ownerId: string,
): Promise<RolePermissions> {
  const base = await getMemberPermissions(db, serverId, userId, ownerId);
  if (base.administrator || userId === ownerId) {
    return { ...FULL_PERMISSIONS };
  }

  try {
    const everyoneRole = await db
      .prepare(
        "SELECT id FROM server_roles WHERE server_id = ? AND is_everyone = 1 LIMIT 1",
      )
      .bind(serverId)
      .first<{ id: string }>();

    const memberRoleIds = await db
      .prepare("SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(serverId, userId)
      .all<{ role_id: string }>();

    const overwrites = await getChannelOverwrites(db, channelId);
    const applicable: Array<{ allow: RolePermissions; deny: RolePermissions }> = [];

    for (const ow of overwrites) {
      if (ow.targetType === "role" && ow.targetId === everyoneRole?.id) {
        applicable.push({ allow: ow.allow, deny: ow.deny });
      }
    }

    for (const ow of overwrites) {
      if (
        ow.targetType === "role" &&
        (memberRoleIds.results ?? []).some((r) => r.role_id === ow.targetId)
      ) {
        applicable.push({ allow: ow.allow, deny: ow.deny });
      }
    }

    for (const ow of overwrites) {
      if (ow.targetType === "member" && ow.targetId === userId) {
        applicable.push({ allow: ow.allow, deny: ow.deny });
      }
    }

    return applyOverwrites(base, applicable);
  } catch {
    return base;
  }
}

export async function channelMemberHasPermission(
  db: D1Database,
  serverId: string,
  channelId: string,
  userId: string,
  ownerId: string,
  key: PermissionKey,
): Promise<boolean> {
  const permissions = await getChannelMemberPermissions(db, serverId, channelId, userId, ownerId);
  return hasPermission(permissions, key);
}

export async function upsertChannelOverwrite(
  db: D1Database,
  channelId: string,
  targetType: "role" | "member",
  targetId: string,
  allow: RolePermissions,
  deny: RolePermissions,
): Promise<string> {
  const id = crypto.randomUUID();
  const allowJson = JSON.stringify(allow);
  const denyJson = JSON.stringify(deny);

  await db
    .prepare(
      `INSERT INTO channel_permission_overwrites
         (id, channel_id, target_type, target_id, allow_permissions, deny_permissions)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, target_type, target_id) DO UPDATE SET
         allow_permissions = excluded.allow_permissions,
         deny_permissions = excluded.deny_permissions`,
    )
    .bind(id, channelId, targetType, targetId, allowJson, denyJson)
    .run();

  const row = await db
    .prepare(
      "SELECT id FROM channel_permission_overwrites WHERE channel_id = ? AND target_type = ? AND target_id = ? LIMIT 1",
    )
    .bind(channelId, targetType, targetId)
    .first<{ id: string }>();

  return row?.id ?? id;
}

export async function deleteChannelOverwrite(db: D1Database, overwriteId: string): Promise<void> {
  await db.prepare("DELETE FROM channel_permission_overwrites WHERE id = ?").bind(overwriteId).run();
}
