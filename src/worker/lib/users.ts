import type { TokenPayload } from "./auth";

export const AVATAR_SIZE = 128;
export const MAX_AVATAR_BYTES = 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface UserRow {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export function mapApiUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.username,
    avatarUrl: row.avatar_url ? `/api/auth/avatars/${row.id}` : null,
  };
}

export async function getUserRow(
  db: D1Database,
  userId: string,
): Promise<UserRow | null> {
  return db
    .prepare(
      "SELECT id, username, email, display_name, avatar_url FROM users WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<UserRow>();
}

export function avatarStorageKey(userId: string, extension: string): string {
  return `avatars/${userId}/avatar.${extension}`;
}

export function extensionForAvatarType(contentType: string): string | null {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export function sessionUserFromPayload(
  payload: TokenPayload,
  row: UserRow,
) {
  return {
    id: payload.sub,
    username: row.username,
    email: row.email,
    displayName: row.username,
    avatarUrl: row.avatar_url ? `/api/auth/avatars/${row.id}` : null,
  };
}
