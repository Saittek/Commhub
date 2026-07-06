export async function isEitherUserBlocked(
  db: D1Database,
  userA: string,
  userB: string,
): Promise<boolean> {
  const block = await db
    .prepare(
      `SELECT id FROM user_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?)
       LIMIT 1`,
    )
    .bind(userA, userB, userB, userA)
    .first<{ id: string }>();

  return Boolean(block);
}

export async function listBlockedUsers(
  db: D1Database,
  userId: string,
): Promise<Array<{ userId: string; username: string; displayName: string }>> {
  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.username, u.display_name
       FROM user_blocks b
       INNER JOIN users u ON u.id = b.blocked_user_id
       WHERE b.blocker_user_id = ?
       ORDER BY b.created_at DESC`,
    )
    .bind(userId)
    .all<{ user_id: string; username: string; display_name: string }>();

  return (result.results ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
  }));
}
