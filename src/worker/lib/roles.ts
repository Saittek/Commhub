import {
  ALL_PERMISSION_KEYS,
  DEFAULT_EVERYONE_PERMISSIONS,
  FULL_PERMISSIONS,
  parsePermissions,
  serializePermissions,
  type PermissionKey,
  type RolePermissions,
} from "./permissions";

const ROLE_NAME_PATTERN = /^[\w\s-]{2,32}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface RoleRow {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
  is_everyone: number;
  is_managed: number;
  created_at: string;
}

export interface CreateRoleInput {
  name: string;
  color?: string;
  permissions?: RolePermissions;
}

export interface UpdateRoleInput {
  name?: string;
  color?: string;
  position?: number;
  permissions?: RolePermissions;
}

export function mapRole(row: RoleRow, memberCount = 0) {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    color: row.color,
    position: row.position,
    permissions: parsePermissions(row.permissions),
    isEveryone: row.is_everyone === 1,
    isManaged: row.is_managed === 1,
    memberCount,
    createdAt: row.created_at,
  };
}

export function validateRoleName(name: string): string | null {
  const trimmed = name.trim();
  if (!ROLE_NAME_PATTERN.test(trimmed)) {
    return "Role name must be 2-32 characters using letters, numbers, spaces, hyphens, or underscores.";
  }
  return null;
}

export function validateRoleColor(color: string): string | null {
  if (!COLOR_PATTERN.test(color)) {
    return "Role color must be a valid hex color (e.g. #14b8a6).";
  }
  return null;
}

export function sanitizePermissions(input: RolePermissions | undefined): RolePermissions {
  if (!input) {
    return {};
  }
  const cleaned: RolePermissions = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (input[key]) {
      cleaned[key] = true;
    }
  }
  if (cleaned.administrator) {
    return { ...FULL_PERMISSIONS };
  }
  return cleaned;
}

export async function ensureDefaultRoles(
  db: D1Database,
  serverId: string,
  ownerId: string,
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM server_roles WHERE server_id = ? LIMIT 1")
    .bind(serverId)
    .first<{ id: string }>();

  if (existing) {
    return;
  }

  const everyoneId = crypto.randomUUID();
  const ownerRoleId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO server_roles (id, server_id, name, color, position, permissions, is_everyone, is_managed)
         VALUES (?, ?, '@everyone', '#99aab5', 0, ?, 1, 1)`,
      )
      .bind(everyoneId, serverId, serializePermissions(DEFAULT_EVERYONE_PERMISSIONS)),
    db
      .prepare(
        `INSERT INTO server_roles (id, server_id, name, color, position, permissions, is_everyone, is_managed)
         VALUES (?, ?, 'Owner', '#f1c40f', 100, ?, 0, 1)`,
      )
      .bind(ownerRoleId, serverId, serializePermissions(FULL_PERMISSIONS)),
    db
      .prepare(
        "INSERT INTO member_roles (id, server_id, user_id, role_id) VALUES (?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), serverId, ownerId, ownerRoleId),
  ]);
}

export async function userCanManageRoles(
  db: D1Database,
  serverId: string,
  userId: string,
  ownerId: string,
): Promise<boolean> {
  if (userId === ownerId) {
    return true;
  }

  const result = await db
    .prepare(
      `SELECT sr.permissions
       FROM member_roles mr
       INNER JOIN server_roles sr ON sr.id = mr.role_id
       WHERE mr.server_id = ? AND mr.user_id = ?`,
    )
    .bind(serverId, userId)
    .all<{ permissions: string }>();

  const rows = result.results ?? [];
  for (const row of rows) {
    const permissions = parsePermissions(row.permissions);
    if (permissions.administrator || permissions.manage_roles) {
      return true;
    }
  }

  return false;
}

export function validateCreateRole(input: CreateRoleInput): string | null {
  const nameError = validateRoleName(input.name);
  if (nameError) {
    return nameError;
  }
  if (input.color) {
    const colorError = validateRoleColor(input.color);
    if (colorError) {
      return colorError;
    }
  }
  return null;
}

export function validateUpdateRole(input: UpdateRoleInput): string | null {
  if (input.name !== undefined) {
    const nameError = validateRoleName(input.name);
    if (nameError) {
      return nameError;
    }
  }
  if (input.color !== undefined) {
    const colorError = validateRoleColor(input.color);
    if (colorError) {
      return colorError;
    }
  }
  if (
    input.position !== undefined &&
    (!Number.isInteger(input.position) || input.position < 0 || input.position > 999)
  ) {
    return "Role position must be between 0 and 999.";
  }
  return null;
}

export type { PermissionKey, RolePermissions };
