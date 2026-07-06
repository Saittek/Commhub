import { isEitherUserBlocked } from "./blocks";

async function getOrCreateDmChannel(
  db: D1Database,
  userA: string,
  userB: string,
): Promise<string> {
  const existing = await db
    .prepare(
      `SELECT dc.id FROM dm_channels dc
       INNER JOIN dm_participants p1 ON p1.channel_id = dc.id AND p1.user_id = ?
       INNER JOIN dm_participants p2 ON p2.channel_id = dc.id AND p2.user_id = ?
       LIMIT 1`,
    )
    .bind(userA, userB)
    .first<{ id: string }>();

  if (existing) {
    return existing.id;
  }

  const channelId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO dm_channels (id) VALUES (?)").bind(channelId),
    db.prepare("INSERT INTO dm_participants (channel_id, user_id) VALUES (?, ?), (?, ?)").bind(
      channelId,
      userA,
      channelId,
      userB,
    ),
  ]);

  return channelId;
}

export async function canInviteUserToVoice(
  db: D1Database,
  inviterId: string,
  targetUserId: string,
  serverId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (inviterId === targetUserId) {
    return { ok: false, reason: "You cannot invite yourself." };
  }

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(targetUserId)
    .first<{ id: string }>();

  if (!target) {
    return { ok: false, reason: "User not found." };
  }

  if (await isEitherUserBlocked(db, inviterId, targetUserId)) {
    return { ok: false, reason: "You cannot invite this user." };
  }

  const friendship = await db
    .prepare(
      "SELECT 1 FROM friendships WHERE user_id = ? AND friend_user_id = ? LIMIT 1",
    )
    .bind(inviterId, targetUserId)
    .first();

  if (friendship) {
    return { ok: true };
  }

  const membership = await db
    .prepare(
      "SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
    .bind(serverId, targetUserId)
    .first();

  if (membership) {
    return { ok: true };
  }

  return { ok: false, reason: "You can only invite friends or members of this server." };
}

export async function sendVoiceInvite(input: {
  db: D1Database;
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
}): Promise<{ inviteId: string; alreadySent: boolean }> {
  const recent = await input.db
    .prepare(
      `SELECT id FROM voice_invites
       WHERE channel_id = ? AND from_user_id = ? AND to_user_id = ?
         AND status = 'pending'
         AND created_at > datetime('now', '-30 seconds')
       LIMIT 1`,
    )
    .bind(input.channelId, input.fromUserId, input.toUserId)
    .first<{ id: string }>();

  if (recent) {
    return { inviteId: recent.id, alreadySent: true };
  }

  const inviteId = crypto.randomUUID();
  await input.db
    .prepare(
      `INSERT INTO voice_invites (id, server_id, channel_id, from_user_id, to_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(inviteId, input.serverId, input.channelId, input.fromUserId, input.toUserId)
    .run();

  const dmChannelId = await getOrCreateDmChannel(input.db, input.fromUserId, input.toUserId);
  const messageId = crypto.randomUUID();
  const content =
    `🎤 **${input.fromDisplayName}** invited you to join **${input.channelName}** in **${input.serverName}**.\n` +
    `<!--voice-invite:${input.serverId}:${input.channelId}:${inviteId}-->`;

  await input.db
    .prepare(
      "INSERT INTO dm_messages (id, channel_id, author_id, content) VALUES (?, ?, ?, ?)",
    )
    .bind(messageId, dmChannelId, input.fromUserId, content)
    .run();

  return { inviteId, alreadySent: false };
}
