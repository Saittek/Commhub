export async function isUserBanned(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const ban = await db
    .prepare(
      "SELECT id FROM server_bans WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
    .bind(serverId, userId)
    .first<{ id: string }>();

  return Boolean(ban);
}

export interface ServerBanRow {
  id: string;
  user_id: string | null;
  username: string | null;
  reason: string;
  banned_by: string;
  created_at: string;
  banned_by_username?: string | null;
}

export async function listBans(
  db: D1Database,
  serverId: string,
): Promise<
  Array<{
    id: string;
    userId: string | null;
    username: string | null;
    reason: string;
    bannedBy: string;
    bannedByUsername: string | null;
    createdAt: string;
  }>
> {
  const result = await db
    .prepare(
      `SELECT b.id, b.user_id, b.username, b.reason, b.banned_by, b.created_at,
              u.username AS banned_by_username
       FROM server_bans b
       LEFT JOIN users u ON u.id = b.banned_by
       WHERE b.server_id = ?
       ORDER BY b.created_at DESC`,
    )
    .bind(serverId)
    .all<ServerBanRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    reason: row.reason,
    bannedBy: row.banned_by,
    bannedByUsername: row.banned_by_username ?? null,
    createdAt: row.created_at,
  }));
}

export async function removeBan(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM server_bans WHERE server_id = ? AND user_id = ?")
    .bind(serverId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function createServerBan(
  db: D1Database,
  input: {
    serverId: string;
    userId: string;
    username: string;
    reason: string;
    bannedBy: string;
  },
): Promise<string> {
  const banId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO server_bans (id, server_id, user_id, username, reason, banned_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        banId,
        input.serverId,
        input.userId,
        input.username,
        input.reason.trim(),
        input.bannedBy,
      ),
    db
      .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
      .bind(input.serverId, input.userId),
    db
      .prepare("DELETE FROM member_roles WHERE server_id = ? AND user_id = ?")
      .bind(input.serverId, input.userId),
    db
      .prepare("DELETE FROM server_presence WHERE server_id = ? AND user_id = ?")
      .bind(input.serverId, input.userId),
  ]);

  return banId;
}
