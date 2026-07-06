import type { Context } from "hono";
import type { TokenPayload } from "./auth";
import { isUserBanned } from "./bans";
import { memberHasPermission } from "./user-permissions";

interface ServerRow {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  description: string;
  region: string;
  invites_paused: number;
  verification_level: number;
  default_notifications: string;
  explicit_content_filter: number;
  afk_timeout_minutes: number;
  ui_text_scale?: number;
  is_public?: number;
  created_at: string;
  icon_url: string | null;
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("no such column") && message.includes(column);
}

const SERVER_SELECT_COLUMNS = `id, name, invite_code, owner_id, description, region, invites_paused,
              verification_level, default_notifications, explicit_content_filter,
              afk_timeout_minutes, created_at, icon_url`;

const SERVER_SELECT_FULL = `${SERVER_SELECT_COLUMNS}, ui_text_scale, is_public`;

export function serverIconStorageKey(serverId: string, extension: string): string {
  return `server-icons/${serverId}/icon.${extension}`;
}

export function serverIconUrl(serverId: string, iconUrl: string | null): string | null {
  return iconUrl ? `/api/servers/${serverId}/icon` : null;
}

export interface ServerMemberRow {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  nickname?: string | null;
  joined_at: string;
  is_owner: number;
}

export function mapServer(server: ServerRow) {
  return {
    id: server.id,
    name: server.name,
    inviteCode: server.invite_code,
    ownerId: server.owner_id,
    description: server.description,
    region: server.region,
    invitesPaused: server.invites_paused === 1,
    verificationLevel: server.verification_level,
    defaultNotifications: server.default_notifications,
    explicitContentFilter: server.explicit_content_filter === 1,
    afkTimeoutMinutes: server.afk_timeout_minutes,
    uiTextScale: server.ui_text_scale ?? 100,
    isPublic: server.is_public === 1,
    createdAt: server.created_at,
    iconUrl: serverIconUrl(server.id, server.icon_url),
  };
}

export async function getServerById(
  db: D1Database,
  serverId: string,
): Promise<ServerRow | null> {
  try {
    return await db
      .prepare(`SELECT ${SERVER_SELECT_FULL} FROM servers WHERE id = ? LIMIT 1`)
      .bind(serverId)
      .first<ServerRow>();
  } catch (error) {
    if (
      !isMissingColumnError(error, "ui_text_scale") &&
      !isMissingColumnError(error, "is_public")
    ) {
      throw error;
    }
  }

  const server = await db
    .prepare(`SELECT ${SERVER_SELECT_COLUMNS} FROM servers WHERE id = ? LIMIT 1`)
    .bind(serverId)
    .first<ServerRow>();

  return server ? { ...server, ui_text_scale: 100, is_public: 0 } : null;
}

export interface PublicServerRow {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  member_count: number;
}

export async function listPublicServers(
  db: D1Database,
  userId: string,
): Promise<PublicServerRow[]> {
  try {
    const result = await db
      .prepare(
        `SELECT s.id, s.name, s.description, s.icon_url,
                (SELECT COUNT(*) FROM server_members sm2 WHERE sm2.server_id = s.id) AS member_count
         FROM servers s
         WHERE s.is_public = 1 AND s.invites_paused = 0
           AND s.id NOT IN (
             SELECT server_id FROM server_members WHERE user_id = ?
           )
         ORDER BY member_count DESC, s.name ASC
         LIMIT 48`,
      )
      .bind(userId)
      .all<PublicServerRow>();

    return result.results ?? [];
  } catch (error) {
    if (!isMissingColumnError(error, "is_public")) {
      throw error;
    }
    return [];
  }
}

export interface MyServerRow {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  icon_url: string | null;
  ui_text_scale?: number;
}

export async function listMyServers(db: D1Database, userId: string): Promise<MyServerRow[]> {
  const baseFrom = `FROM servers s
     INNER JOIN server_members sm ON sm.server_id = s.id
     WHERE sm.user_id = ?
     ORDER BY sm.joined_at ASC`;

  try {
    const result = await db
      .prepare(
        `SELECT s.id, s.name, s.invite_code, s.owner_id, s.created_at, s.icon_url, s.ui_text_scale ${baseFrom}`,
      )
      .bind(userId)
      .all<MyServerRow>();

    return result.results ?? [];
  } catch (error) {
    if (
      !isMissingColumnError(error, "ui_text_scale") &&
      !isMissingColumnError(error, "icon_url")
    ) {
      throw error;
    }
  }

  try {
    const result = await db
      .prepare(
        `SELECT s.id, s.name, s.invite_code, s.owner_id, s.created_at, s.icon_url ${baseFrom}`,
      )
      .bind(userId)
      .all<Omit<MyServerRow, "ui_text_scale">>();

    return (result.results ?? []).map((server) => ({ ...server, ui_text_scale: 100 }));
  } catch (error) {
    if (!isMissingColumnError(error, "icon_url")) {
      throw error;
    }
  }

  const result = await db
    .prepare(
      `SELECT s.id, s.name, s.invite_code, s.owner_id, s.created_at ${baseFrom}`,
    )
    .bind(userId)
    .all<Omit<MyServerRow, "icon_url" | "ui_text_scale">>();

  return (result.results ?? []).map((server) => ({
    ...server,
    icon_url: null,
    ui_text_scale: 100,
  }));
}

export async function requireServerMember(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
): Promise<ServerRow | Response> {
  const server = await getServerById(c.env.DB, serverId);
  if (!server) {
    return Response.json({ error: "Server not found." }, { status: 404 });
  }

  const membership = await c.env.DB.prepare(
    "SELECT id FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  )
    .bind(serverId, user.sub)
    .first<{ id: string }>();

  if (!membership) {
    return Response.json({ error: "You are not a member of this server." }, { status: 403 });
  }

  if (await isUserBanned(c.env.DB, serverId, user.sub)) {
    return Response.json({ error: "You are banned from this server." }, { status: 403 });
  }

  return server;
}

export async function requireManageServer(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  server: ServerRow,
): Promise<true | Response> {
  if (server.owner_id === user.sub) {
    return true;
  }

  const allowed = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "manage_server",
  );

  if (!allowed) {
    return Response.json(
      { error: "You do not have permission to manage server settings." },
      { status: 403 },
    );
  }

  return true;
}

export async function requireServerOwner(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
): Promise<ServerRow | Response> {
  const server = await requireServerMember(c, user, serverId);
  if (server instanceof Response) {
    return server;
  }

  if (server.owner_id !== user.sub) {
    return Response.json({ error: "Only the server owner can do that." }, { status: 403 });
  }

  return server;
}

export async function getServerMembers(
  db: D1Database,
  serverId: string,
): Promise<ServerMemberRow[]> {
  try {
    const result = await db
      .prepare(
        `SELECT sm.id, sm.user_id, u.username, u.display_name, sm.nickname, sm.joined_at,
                CASE WHEN s.owner_id = sm.user_id THEN 1 ELSE 0 END AS is_owner
         FROM server_members sm
         INNER JOIN users u ON u.id = sm.user_id
         INNER JOIN servers s ON s.id = sm.server_id
         WHERE sm.server_id = ?
         ORDER BY is_owner DESC, sm.joined_at ASC`,
      )
      .bind(serverId)
      .all<ServerMemberRow>();

    return result.results ?? [];
  } catch {
    const result = await db
      .prepare(
        `SELECT sm.id, sm.user_id, u.username, u.display_name, sm.joined_at,
                CASE WHEN s.owner_id = sm.user_id THEN 1 ELSE 0 END AS is_owner
         FROM server_members sm
         INNER JOIN users u ON u.id = sm.user_id
         INNER JOIN servers s ON s.id = sm.server_id
         WHERE sm.server_id = ?
         ORDER BY is_owner DESC, sm.joined_at ASC`,
      )
      .bind(serverId)
      .all<ServerMemberRow>();

    return result.results ?? [];
  }
}
