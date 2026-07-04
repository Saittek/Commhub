const MESSAGE_MAX_LENGTH = 2000;
const MENTION_EVERYONE_PATTERN = /@(everyone|here)\b/i;

export interface MessageRow {
  id: string;
  channel_id: string;
  server_id: string;
  author_id: string;
  content: string;
  thread_root_id: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface AuthorRow {
  id: string;
  username: string;
  display_name: string;
}

export interface ReactionRow {
  message_id: string;
  emoji: string;
  user_id: string;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size: number;
  storage_key: string;
}

export interface CreateMessageInput {
  content: string;
  threadRootId?: string | null;
  replyToId?: string | null;
  attachmentIds?: string[];
}

export interface MessageDto {
  id: string;
  channelId: string;
  serverId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
  };
  content: string;
  threadRootId: string | null;
  replyToId: string | null;
  replyTo: {
    id: string;
    content: string;
    authorName: string;
  } | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  pinned: boolean;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }>;
  reactions: Array<{
    emoji: string;
    count: number;
    me: boolean;
    userIds: string[];
  }>;
}

export function validateMessageContent(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "Message cannot be empty.";
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export function contentMentionsEveryone(content: string): boolean {
  return MENTION_EVERYONE_PATTERN.test(content);
}

export function validateEmoji(emoji: string): string | null {
  if (!emoji || emoji.length > 8 || /^[\x00-\x7F]+$/.test(emoji)) {
    return "Invalid reaction emoji.";
  }
  return null;
}

export async function getMessageAuthors(
  db: D1Database,
  authorIds: string[],
): Promise<Map<string, AuthorRow>> {
  const map = new Map<string, AuthorRow>();
  if (authorIds.length === 0) {
    return map;
  }

  const placeholders = authorIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT id, username, display_name FROM users WHERE id IN (${placeholders})`,
    )
    .bind(...authorIds)
    .all<AuthorRow>();

  for (const row of result.results ?? []) {
    map.set(row.id, row);
  }

  return map;
}

export async function listChannelMessages(
  db: D1Database,
  channelId: string,
  options: {
    before?: string;
    limit?: number;
    threadRootId?: string | null;
    viewerUserId: string;
    serverId: string;
  },
): Promise<MessageDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const threadRootId = options.threadRootId ?? null;

  let rows: MessageRow[];

  if (options.before) {
    const anchor = await db
      .prepare("SELECT created_at FROM messages WHERE id = ? AND channel_id = ? LIMIT 1")
      .bind(options.before, channelId)
      .first<{ created_at: string }>();

    if (!anchor) {
      return [];
    }

    const result = await db
      .prepare(
        `SELECT id, channel_id, server_id, author_id, content, thread_root_id, reply_to_id, created_at, edited_at, deleted_at
         FROM messages
         WHERE channel_id = ?
           AND ((? IS NULL AND thread_root_id IS NULL) OR thread_root_id = ?)
           AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(channelId, threadRootId, threadRootId, anchor.created_at, limit)
      .all<MessageRow>();
    rows = (result.results ?? []).reverse();
  } else {
    const result = await db
      .prepare(
        `SELECT id, channel_id, server_id, author_id, content, thread_root_id, reply_to_id, created_at, edited_at, deleted_at
         FROM messages
         WHERE channel_id = ?
           AND ((? IS NULL AND thread_root_id IS NULL) OR thread_root_id = ?)
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(channelId, threadRootId, threadRootId, limit)
      .all<MessageRow>();
    rows = (result.results ?? []).reverse();
  }

  return hydrateMessages(db, rows, options.viewerUserId, options.serverId);
}

export async function getMessageById(
  db: D1Database,
  channelId: string,
  messageId: string,
  viewerUserId: string,
  serverId: string,
): Promise<MessageDto | null> {
  const row = await db
    .prepare(
      `SELECT id, channel_id, server_id, author_id, content, thread_root_id, reply_to_id, created_at, edited_at, deleted_at
       FROM messages WHERE id = ? AND channel_id = ? LIMIT 1`,
    )
    .bind(messageId, channelId)
    .first<MessageRow>();

  if (!row) {
    return null;
  }

  const messages = await hydrateMessages(db, [row], viewerUserId, serverId);
  return messages[0] ?? null;
}

async function hydrateMessages(
  db: D1Database,
  rows: MessageRow[],
  viewerUserId: string,
  serverId: string,
): Promise<MessageDto[]> {
  if (rows.length === 0) {
    return [];
  }

  const messageIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const replyIds = rows
    .map((row) => row.reply_to_id)
    .filter((id): id is string => Boolean(id));

  const authors = await getMessageAuthors(db, authorIds);

  const replyRows = replyIds.length
    ? await db
        .prepare(
          `SELECT m.id, m.content, m.deleted_at, u.display_name
           FROM messages m
           INNER JOIN users u ON u.id = m.author_id
           WHERE m.id IN (${replyIds.map(() => "?").join(", ")})`,
        )
        .bind(...replyIds)
        .all<{ id: string; content: string; deleted_at: string | null; display_name: string }>()
    : { results: [] as Array<{ id: string; content: string; deleted_at: string | null; display_name: string }> };

  const replyMap = new Map(
    (replyRows.results ?? []).map((row) => [
      row.id,
      {
        id: row.id,
        content: row.deleted_at ? "Original message was deleted." : row.content,
        authorName: row.display_name,
      },
    ]),
  );

  const placeholders = messageIds.map(() => "?").join(", ");

  const reactionsResult = await db
    .prepare(
      `SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${placeholders})`,
    )
    .bind(...messageIds)
    .all<ReactionRow>();

  const attachmentsResult = await db
    .prepare(
      `SELECT id, message_id, filename, content_type, size, storage_key
       FROM message_attachments WHERE message_id IN (${placeholders})`,
    )
    .bind(...messageIds)
    .all<AttachmentRow>();

  const pinnedResult = await db
    .prepare(
      `SELECT message_id FROM pinned_messages WHERE channel_id = ? AND message_id IN (${placeholders})`,
    )
    .bind(rows[0]?.channel_id ?? "", ...messageIds)
    .all<{ message_id: string }>();

  const pinnedSet = new Set((pinnedResult.results ?? []).map((row) => row.message_id));

  const reactionsByMessage = new Map<string, Map<string, { count: number; userIds: string[] }>>();
  for (const reaction of reactionsResult.results ?? []) {
    const byEmoji = reactionsByMessage.get(reaction.message_id) ?? new Map();
    const existing = byEmoji.get(reaction.emoji) ?? { count: 0, userIds: [] };
    existing.count += 1;
    existing.userIds.push(reaction.user_id);
    byEmoji.set(reaction.emoji, existing);
    reactionsByMessage.set(reaction.message_id, byEmoji);
  }

  const attachmentsByMessage = new Map<string, AttachmentRow[]>();
  for (const attachment of attachmentsResult.results ?? []) {
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }

  return rows.map((row) => {
    const author = authors.get(row.author_id);
    const reactionMap = reactionsByMessage.get(row.id) ?? new Map();

    return {
      id: row.id,
      channelId: row.channel_id,
      serverId: row.server_id,
      author: {
        id: row.author_id,
        username: author?.username ?? "unknown",
        displayName: author?.display_name ?? "Unknown",
      },
      content: row.deleted_at ? "" : row.content,
      threadRootId: row.thread_root_id,
      replyToId: row.reply_to_id,
      replyTo: row.reply_to_id ? replyMap.get(row.reply_to_id) ?? null : null,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      pinned: pinnedSet.has(row.id),
      attachments: (attachmentsByMessage.get(row.id) ?? []).map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        size: attachment.size,
        url: `/api/servers/${serverId}/attachments/${attachment.id}`,
      })),
      reactions: [...reactionMap.entries()].map(([emoji, data]) => ({
        emoji,
        count: data.count,
        me: data.userIds.includes(viewerUserId),
        userIds: data.userIds,
      })),
    };
  });
}

export async function countUnreadMessages(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<number> {
  const readState = await db
    .prepare(
      "SELECT last_read_at FROM channel_read_state WHERE user_id = ? AND channel_id = ? LIMIT 1",
    )
    .bind(userId, channelId)
    .first<{ last_read_at: string }>();

  if (!readState) {
    const result = await db
      .prepare(
        "SELECT COUNT(*) as count FROM messages WHERE channel_id = ? AND thread_root_id IS NULL AND deleted_at IS NULL",
      )
      .bind(channelId)
      .first<{ count: number }>();
    return result?.count ?? 0;
  }

  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM messages
       WHERE channel_id = ? AND thread_root_id IS NULL AND deleted_at IS NULL
         AND created_at > ? AND author_id != ?`,
    )
    .bind(channelId, readState.last_read_at, userId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

export async function markChannelRead(
  db: D1Database,
  channelId: string,
  userId: string,
  messageId?: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO channel_read_state (user_id, channel_id, last_read_at, last_read_message_id)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(user_id, channel_id) DO UPDATE SET
         last_read_at = datetime('now'),
         last_read_message_id = excluded.last_read_message_id`,
    )
    .bind(userId, channelId, messageId ?? null)
    .run();
}

export async function getLastUserMessageAt(
  db: D1Database,
  channelId: string,
  userId: string,
  threadRootId: string | null,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT created_at FROM messages
       WHERE channel_id = ? AND author_id = ?
         AND ((? IS NULL AND thread_root_id IS NULL) OR thread_root_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(channelId, userId, threadRootId, threadRootId)
    .first<{ created_at: string }>();

  return row?.created_at ?? null;
}

export async function listPinnedMessages(
  db: D1Database,
  channelId: string,
  viewerUserId: string,
  serverId: string,
): Promise<MessageDto[]> {
  const result = await db
    .prepare(
      `SELECT m.id, m.channel_id, m.server_id, m.author_id, m.content, m.thread_root_id, m.reply_to_id, m.created_at, m.edited_at, m.deleted_at
       FROM pinned_messages pm
       INNER JOIN messages m ON m.id = pm.message_id
       WHERE pm.channel_id = ?
       ORDER BY pm.pinned_at DESC`,
    )
    .bind(channelId)
    .all<MessageRow>();

  return hydrateMessages(db, result.results ?? [], viewerUserId, serverId);
}

export async function linkAttachmentsToMessage(
  db: D1Database,
  messageId: string,
  attachmentIds: string[],
  authorId: string,
): Promise<void> {
  if (attachmentIds.length === 0) {
    return;
  }

  const placeholders = attachmentIds.map(() => "?").join(", ");
  await db
    .prepare(
      `UPDATE message_attachments
       SET message_id = ?
       WHERE id IN (${placeholders})
         AND message_id IS NULL
         AND storage_key LIKE ?`,
    )
    .bind(messageId, ...attachmentIds, `${authorId}/%`)
    .run();
}

export async function createPendingAttachment(
  db: D1Database,
  input: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO message_attachments (id, message_id, filename, content_type, size, storage_key)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.filename, input.contentType, input.size, input.storageKey)
    .run();
}

export async function getAttachment(
  db: D1Database,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  return db
    .prepare(
      "SELECT id, message_id, filename, content_type, size, storage_key FROM message_attachments WHERE id = ? LIMIT 1",
    )
    .bind(attachmentId)
    .first<AttachmentRow>();
}
