import {
  FULL_PERMISSIONS,
  hasPermission,
  mergePermissions,
  parsePermissions,
  type PermissionKey,
  type RolePermissions,
} from "./permissions";

export async function getMemberPermissions(
  db: D1Database,
  serverId: string,
  userId: string,
  ownerId: string,
): Promise<RolePermissions> {
  if (userId === ownerId) {
    return { ...FULL_PERMISSIONS };
  }

  const everyoneRow = await db
    .prepare(
      "SELECT permissions FROM server_roles WHERE server_id = ? AND is_everyone = 1 LIMIT 1",
    )
    .bind(serverId)
    .first<{ permissions: string }>();

  const memberRoles = await db
    .prepare(
      `SELECT sr.permissions
       FROM member_roles mr
       INNER JOIN server_roles sr ON sr.id = mr.role_id
       WHERE mr.server_id = ? AND mr.user_id = ?`,
    )
    .bind(serverId, userId)
    .all<{ permissions: string }>();

  const rolePermissions: RolePermissions[] = [];
  if (everyoneRow) {
    rolePermissions.push(parsePermissions(everyoneRow.permissions));
  }

  for (const row of memberRoles.results ?? []) {
    rolePermissions.push(parsePermissions(row.permissions));
  }

  return mergePermissions(rolePermissions);
}

export async function memberHasPermission(
  db: D1Database,
  serverId: string,
  userId: string,
  ownerId: string,
  key: PermissionKey,
): Promise<boolean> {
  const permissions = await getMemberPermissions(db, serverId, userId, ownerId);
  return hasPermission(permissions, key);
}

export async function memberHasAnyPermission(
  db: D1Database,
  serverId: string,
  userId: string,
  ownerId: string,
  keys: PermissionKey[],
): Promise<boolean> {
  const permissions = await getMemberPermissions(db, serverId, userId, ownerId);
  return keys.some((key) => hasPermission(permissions, key));
}
