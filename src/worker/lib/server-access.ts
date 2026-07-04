import type { Context } from "hono";
import type { TokenPayload } from "./auth";

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
  created_at: string;
  icon_url: string | null;
}

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
    createdAt: server.created_at,
    iconUrl: serverIconUrl(server.id, server.icon_url),
  };
}

export async function getServerById(
  db: D1Database,
  serverId: string,
): Promise<ServerRow | null> {
  return db
    .prepare(
      `SELECT id, name, invite_code, owner_id, description, region, invites_paused,
              verification_level, default_notifications, explicit_content_filter,
              afk_timeout_minutes, created_at, icon_url
       FROM servers WHERE id = ? LIMIT 1`,
    )
    .bind(serverId)
    .first<ServerRow>();
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

  return server;
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
