import type { Context } from "hono";
import type { TokenPayload } from "./lib/auth";
import { getServerChannel } from "./lib/channels";
import { requireServerMember } from "./lib/server-access";
import {
  contentMentionsEveryone,
  createPendingAttachment,
  getAttachment,
  getMessageById,
  linkAttachmentsToMessage,
  listChannelMessages,
  listPinnedMessages,
  markChannelRead,
  validateEmoji,
  validateMessageContent,
  type CreateMessageInput,
  type MessageDto,
} from "./lib/messages";
import { memberHasPermission, getMemberPermissions } from "./lib/user-permissions";
import { TextRoom } from "./text-room";

export { TextRoom };

const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function broadcastTextEvent(
  env: Env,
  channelId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (!env.TEXT_ROOM) {
    return;
  }

  try {
    const roomId = env.TEXT_ROOM.idFromName(channelId);
    const stub = env.TEXT_ROOM.get(roomId);
    await stub.fetch(
      new Request("https://text-room/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }),
    );
  } catch {
    // Real-time is best-effort when the text room is unavailable.
  }
}

async function requireTextChannel(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const server = await requireServerMember(c, user, serverId);
  if (server instanceof Response) {
    return server;
  }

  const channel = await getServerChannel(c.env.DB, server.id, channelId);
  if (!channel) {
    return jsonError("Channel not found.", 404);
  }

  if (channel.type !== "text") {
    return jsonError("This channel is not a text channel.", 400);
  }

  return { server, channel };
}

async function checkSlowMode(
  db: D1Database,
  channelId: string,
  userId: string,
  slowModeSeconds: number,
  threadRootId: string | null,
): Promise<string | null> {
  if (slowModeSeconds <= 0) {
    return null;
  }

  const blocked = await db
    .prepare(
      `SELECT id FROM messages
       WHERE channel_id = ? AND author_id = ?
         AND ((? IS NULL AND thread_root_id IS NULL) OR thread_root_id = ?)
         AND datetime(created_at, '+' || ? || ' seconds') > datetime('now')
       LIMIT 1`,
    )
    .bind(channelId, userId, threadRootId, threadRootId, slowModeSeconds)
    .first<{ id: string }>();

  if (blocked) {
    return `Slow mode is enabled. Wait ${slowModeSeconds} seconds between messages.`;
  }

  return null;
}

export async function handleGetMyPermissions(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
) {
  const server = await requireServerMember(c, user, serverId);
  if (server instanceof Response) {
    return server;
  }

  const permissions = await getMemberPermissions(c.env.DB, server.id, user.sub, server.owner_id);
  return c.json({ permissions });
}

export async function handleListMessages(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const before = c.req.query("before");
  const limit = Number(c.req.query("limit") ?? "50");
  const threadRootId = c.req.query("thread") ?? null;

  const messages = await listChannelMessages(c.env.DB, channelId, {
    before,
    limit: Number.isFinite(limit) ? limit : 50,
    threadRootId,
    viewerUserId: user.sub,
    serverId: result.server.id,
  });

  return c.json({ messages });
}

export async function handleCreateMessage(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const canSend = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "send_messages",
  );
  if (!canSend) {
    return jsonError("You do not have permission to send messages.", 403);
  }

  const body = await c.req.json<CreateMessageInput>();
  const content = (body.content ?? "").trim();
  const validationError = validateMessageContent(content);
  if (validationError && !(body.attachmentIds?.length ?? 0)) {
    return jsonError(validationError, 400);
  }

  if (contentMentionsEveryone(content)) {
    const canMention = await memberHasPermission(
      c.env.DB,
      result.server.id,
      user.sub,
      result.server.owner_id,
      "mention_everyone",
    );
    if (!canMention) {
      return jsonError("You do not have permission to mention @everyone or @here.", 403);
    }
  }

  const threadRootId = body.threadRootId ?? null;
  if (threadRootId) {
    const root = await c.env.DB.prepare(
      "SELECT id FROM messages WHERE id = ? AND channel_id = ? AND thread_root_id IS NULL LIMIT 1",
    )
      .bind(threadRootId, channelId)
      .first<{ id: string }>();
    if (!root) {
      return jsonError("Thread root message not found.", 404);
    }
  }

  if (body.replyToId) {
    const reply = await c.env.DB.prepare(
      "SELECT id FROM messages WHERE id = ? AND channel_id = ? LIMIT 1",
    )
      .bind(body.replyToId, channelId)
      .first<{ id: string }>();
    if (!reply) {
      return jsonError("Reply target not found.", 404);
    }
  }

  const slowModeSeconds = await c.env.DB.prepare(
    "SELECT slow_mode_seconds FROM channels WHERE id = ? LIMIT 1",
  )
    .bind(channelId)
    .first<{ slow_mode_seconds: number }>();

  const slowModeError = await checkSlowMode(
    c.env.DB,
    channelId,
    user.sub,
    slowModeSeconds?.slow_mode_seconds ?? 0,
    threadRootId,
  );
  if (slowModeError) {
    return jsonError(slowModeError, 429);
  }

  if (body.attachmentIds?.length) {
    const canAttach = await memberHasPermission(
      c.env.DB,
      result.server.id,
      user.sub,
      result.server.owner_id,
      "attach_files",
    );
    if (!canAttach) {
      return jsonError("You do not have permission to attach files.", 403);
    }
  }

  const messageId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, channel_id, server_id, author_id, content, thread_root_id, reply_to_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      messageId,
      channelId,
      result.server.id,
      user.sub,
      content,
      threadRootId,
      body.replyToId ?? null,
    )
    .run();

  if (body.attachmentIds?.length) {
    await linkAttachmentsToMessage(c.env.DB, messageId, body.attachmentIds, user.sub);
  }

  const message = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (!message) {
    return jsonError("Message could not be created.", 500);
  }

  await broadcastTextEvent(c.env, channelId, { type: "message-create", message });

  return c.json({ message }, 201);
}

export async function handleUpdateMessage(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const existing = await c.env.DB.prepare(
    "SELECT author_id, deleted_at FROM messages WHERE id = ? AND channel_id = ? LIMIT 1",
  )
    .bind(messageId, channelId)
    .first<{ author_id: string; deleted_at: string | null }>();

  if (!existing || existing.deleted_at) {
    return jsonError("Message not found.", 404);
  }

  const isAuthor = existing.author_id === user.sub;
  const canManage = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "manage_messages",
  );

  if (!isAuthor && !canManage) {
    return jsonError("You do not have permission to edit this message.", 403);
  }

  const body = await c.req.json<{ content?: string }>();
  const content = (body.content ?? "").trim();
  const validationError = validateMessageContent(content);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  if (contentMentionsEveryone(content)) {
    const canMention = await memberHasPermission(
      c.env.DB,
      result.server.id,
      user.sub,
      result.server.owner_id,
      "mention_everyone",
    );
    if (!canMention) {
      return jsonError("You do not have permission to mention @everyone or @here.", 403);
    }
  }

  await c.env.DB.prepare(
    "UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?",
  )
    .bind(content, messageId)
    .run();

  const message = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (!message) {
    return jsonError("Message not found.", 404);
  }

  await broadcastTextEvent(c.env, channelId, { type: "message-update", message });

  return c.json({ message });
}

export async function handleDeleteMessage(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const existing = await c.env.DB.prepare(
    "SELECT author_id, deleted_at FROM messages WHERE id = ? AND channel_id = ? LIMIT 1",
  )
    .bind(messageId, channelId)
    .first<{ author_id: string; deleted_at: string | null }>();

  if (!existing || existing.deleted_at) {
    return jsonError("Message not found.", 404);
  }

  const isAuthor = existing.author_id === user.sub;
  const canManage = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "manage_messages",
  );

  if (!isAuthor && !canManage) {
    return jsonError("You do not have permission to delete this message.", 403);
  }

  await c.env.DB.prepare(
    "UPDATE messages SET deleted_at = datetime('now'), content = '' WHERE id = ?",
  )
    .bind(messageId)
    .run();

  await c.env.DB.prepare(
    "DELETE FROM pinned_messages WHERE channel_id = ? AND message_id = ?",
  )
    .bind(channelId, messageId)
    .run();

  const message = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (message) {
    await broadcastTextEvent(c.env, channelId, { type: "message-update", message });
  }

  return c.json({ ok: true });
}

export async function handleAddReaction(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const body = await c.req.json<{ emoji?: string }>();
  const emoji = (body.emoji ?? "").trim();
  const emojiError = validateEmoji(emoji);
  if (emojiError) {
    return jsonError(emojiError, 400);
  }

  const message = await c.env.DB.prepare(
    "SELECT id, deleted_at FROM messages WHERE id = ? AND channel_id = ? LIMIT 1",
  )
    .bind(messageId, channelId)
    .first<{ id: string; deleted_at: string | null }>();

  if (!message || message.deleted_at) {
    return jsonError("Message not found.", 404);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1",
  )
    .bind(messageId, user.sub, emoji)
    .first<{ id: string }>();

  if (!existing) {
    await c.env.DB.prepare(
      "INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), messageId, user.sub, emoji)
      .run();
  }

  const hydrated = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (hydrated) {
    await broadcastTextEvent(c.env, channelId, {
      type: "message-update",
      message: hydrated,
    });
  }

  return c.json({ message: hydrated });
}

export async function handleRemoveReaction(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
  emoji: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  await c.env.DB.prepare(
    "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
  )
    .bind(messageId, user.sub, decodeURIComponent(emoji))
    .run();

  const hydrated = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (hydrated) {
    await broadcastTextEvent(c.env, channelId, {
      type: "message-update",
      message: hydrated,
    });
  }

  return c.json({ message: hydrated });
}

export async function handlePinMessage(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const canManage = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "manage_messages",
  );
  if (!canManage) {
    return jsonError("You do not have permission to pin messages.", 403);
  }

  const message = await c.env.DB.prepare(
    "SELECT id, deleted_at FROM messages WHERE id = ? AND channel_id = ? LIMIT 1",
  )
    .bind(messageId, channelId)
    .first<{ id: string; deleted_at: string | null }>();

  if (!message || message.deleted_at) {
    return jsonError("Message not found.", 404);
  }

  await c.env.DB.prepare(
    `INSERT INTO pinned_messages (channel_id, message_id, pinned_by)
     VALUES (?, ?, ?)
     ON CONFLICT(channel_id, message_id) DO NOTHING`,
  )
    .bind(channelId, messageId, user.sub)
    .run();

  const hydrated = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (hydrated) {
    await broadcastTextEvent(c.env, channelId, { type: "message-update", message: hydrated });
  }

  return c.json({ message: hydrated });
}

export async function handleUnpinMessage(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
  messageId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const canManage = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "manage_messages",
  );
  if (!canManage) {
    return jsonError("You do not have permission to unpin messages.", 403);
  }

  await c.env.DB.prepare(
    "DELETE FROM pinned_messages WHERE channel_id = ? AND message_id = ?",
  )
    .bind(channelId, messageId)
    .run();

  const hydrated = await getMessageById(
    c.env.DB,
    channelId,
    messageId,
    user.sub,
    result.server.id,
  );

  if (hydrated) {
    await broadcastTextEvent(c.env, channelId, { type: "message-update", message: hydrated });
  }

  return c.json({ message: hydrated });
}

export async function handleListPins(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const pins = await listPinnedMessages(
    c.env.DB,
    channelId,
    user.sub,
    result.server.id,
  );

  return c.json({ pins });
}

export async function handleMarkRead(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const body = await c.req.json<{ messageId?: string }>();
  await markChannelRead(c.env.DB, channelId, user.sub, body.messageId);

  return c.json({ ok: true });
}

export async function handleUploadAttachment(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  const canAttach = await memberHasPermission(
    c.env.DB,
    result.server.id,
    user.sub,
    result.server.owner_id,
    "attach_files",
  );
  if (!canAttach) {
    return jsonError("You do not have permission to attach files.", 403);
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("File uploads are unavailable.", 503);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("No file provided.", 400);
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return jsonError("File must be 8 MB or smaller.", 400);
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
    return jsonError("File type is not allowed.", 400);
  }

  const attachmentId = crypto.randomUUID();
  const storageKey = `${user.sub}/${attachmentId}/${file.name}`;

  await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
    httpMetadata: { contentType },
  });

  await createPendingAttachment(c.env.DB, {
    id: attachmentId,
    filename: file.name,
    contentType,
    size: file.size,
    storageKey,
  });

  return c.json({
    attachment: {
      id: attachmentId,
      filename: file.name,
      contentType,
      size: file.size,
      url: `/api/servers/${serverId}/attachments/${attachmentId}`,
    },
  });
}

export async function handleGetAttachment(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  attachmentId: string,
) {
  const server = await requireServerMember(c, user, serverId);
  if (server instanceof Response) {
    return server;
  }

  const attachment = await getAttachment(c.env.DB, attachmentId);
  if (!attachment) {
    return jsonError("Attachment not found.", 404);
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("File storage is unavailable.", 503);
  }

  const object = await c.env.ATTACHMENTS.get(attachment.storage_key);
  if (!object) {
    return jsonError("Attachment file not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `inline; filename="${attachment.filename}"`);
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(object.body, { headers });
}

export async function handleTextWebSocket(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  serverId: string,
  channelId: string,
) {
  const result = await requireTextChannel(c, user, serverId, channelId);
  if (result instanceof Response) {
    return result;
  }

  if (!c.env.TEXT_ROOM) {
    return jsonError("Text service is unavailable. Restart the dev server.", 503);
  }

  const profile = await c.env.DB.prepare(
    "SELECT username, display_name FROM users WHERE id = ? LIMIT 1",
  )
    .bind(user.sub)
    .first<{ username: string; display_name: string }>();

  if (!profile) {
    return jsonError("User not found.", 404);
  }

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-User-Id", user.sub);
    headers.set("X-Display-Name", profile.display_name);
    headers.set("X-Username", profile.username);

    const roomId = c.env.TEXT_ROOM.idFromName(channelId);
    const stub = c.env.TEXT_ROOM.get(roomId);
    const upgradeRequest = new Request(c.req.raw, { headers });
    return await stub.fetch(upgradeRequest);
  } catch {
    return jsonError("Text connection failed. Restart the dev server.", 500);
  }
}

export type { MessageDto };
