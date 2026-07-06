import type { Hono } from "hono";
import { requireUser } from "./lib/session";
import { requireServerMember } from "./lib/server-access";
import { memberHasPermission } from "./lib/user-permissions";
import { getServerChannel } from "./lib/channels";
import { listBans, removeBan } from "./lib/bans";
import { writeAuditLog } from "./lib/audit-log";
import {
  createPendingDmAttachment,
  getDmAttachment,
  linkDmAttachmentsToMessage,
  loadDmAttachmentsByMessageIds,
} from "./lib/dm-attachments";
import { fetchEmbedPreview, isAllowedEmbedUrl } from "./lib/embed-fetch";
import { rejectExplicitUpload } from "./lib/content-filter";
import { getPrivacySettings } from "./lib/privacy";
import { broadcastTextEvent } from "./message-routes";
import { getMessageById, ensureMessageThreadColumns } from "./lib/messages";

const MAX_DM_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const ALLOWED_DM_ATTACHMENT_TYPES = new Set([
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

function newId(): string {
  return crypto.randomUUID();
}

async function areFriends(db: D1Database, userId: string, otherUserId: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM friendships WHERE user_id = ? AND friend_user_id = ? LIMIT 1",
    )
    .bind(userId, otherUserId)
    .first();

  return Boolean(row);
}

async function requireDmParticipant(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<Response | null> {
  const membership = await db
    .prepare("SELECT 1 FROM dm_participants WHERE channel_id = ? AND user_id = ? LIMIT 1")
    .bind(channelId, userId)
    .first();

  if (!membership) {
    return jsonError("DM channel not found.", 404);
  }

  return null;
}

function mapDmMessage(
  row: {
    id: string;
    channel_id: string;
    author_id: string;
    content: string;
    created_at: string;
    edited_at: string | null;
    username: string;
    display_name: string;
    avatar_url?: string | null;
  },
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }> = [],
) {
  return {
    id: row.id,
    channelId: row.channel_id,
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ? `/api/auth/avatars/${row.author_id}` : null,
    },
    content: row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    attachments,
  };
}

export function registerDiscordCompletionRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/servers/:serverId/bans", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(
        c.env.DB,
        server.id,
        user.sub,
        server.owner_id,
        "ban_members",
      ));

    if (!allowed) {
      return jsonError("You do not have permission to view bans.", 403);
    }

    const bans = await listBans(c.env.DB, server.id);
    return c.json({ bans });
  });

  app.delete("/api/servers/:serverId/bans/:userId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(
        c.env.DB,
        server.id,
        user.sub,
        server.owner_id,
        "ban_members",
      ));

    if (!allowed) {
      return jsonError("You do not have permission to unban members.", 403);
    }

    const targetUserId = c.req.param("userId");
    const removed = await removeBan(c.env.DB, server.id, targetUserId);
    if (!removed) {
      return jsonError("Ban not found.", 404);
    }

    await writeAuditLog(c.env.DB, {
      serverId: server.id,
      actorUserId: user.sub,
      actionType: "member_unban",
      targetType: "user",
      targetId: targetUserId,
    });

    return c.json({ ok: true });
  });

  app.patch("/api/dms/:channelId/messages/:messageId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channelId = c.req.param("channelId");
    const messageId = c.req.param("messageId");
    const denied = await requireDmParticipant(c.env.DB, channelId, user.sub);
    if (denied) return denied;

    const body = (await c.req.json()) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content || content.length > 2000) {
      return jsonError("Message must be 1-2000 characters.", 400);
    }

    const message = await c.env.DB.prepare(
      "SELECT id, author_id, deleted_at FROM dm_messages WHERE id = ? AND channel_id = ? LIMIT 1",
    )
      .bind(messageId, channelId)
      .first<{ id: string; author_id: string; deleted_at: string | null }>();

    if (!message || message.deleted_at) {
      return jsonError("Message not found.", 404);
    }

    if (message.author_id !== user.sub) {
      return jsonError("You can only edit your own messages.", 403);
    }

    await c.env.DB.prepare(
      "UPDATE dm_messages SET content = ?, edited_at = datetime('now') WHERE id = ?",
    )
      .bind(content, messageId)
      .run();

    const row = await c.env.DB.prepare(
      `SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at, m.edited_at,
              u.username, u.display_name, u.avatar_url
       FROM dm_messages m
       INNER JOIN users u ON u.id = m.author_id
       WHERE m.id = ? LIMIT 1`,
    )
      .bind(messageId)
      .first<{
        id: string;
        channel_id: string;
        author_id: string;
        content: string;
        created_at: string;
        edited_at: string | null;
        username: string;
        display_name: string;
        avatar_url: string | null;
      }>();

    if (!row) {
      return jsonError("Message not found.", 404);
    }

    const attachments = await loadDmAttachmentsByMessageIds(c.env.DB, [messageId]);
    return c.json({ message: mapDmMessage(row, attachments.get(messageId) ?? []) });
  });

  app.delete("/api/dms/:channelId/messages/:messageId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channelId = c.req.param("channelId");
    const messageId = c.req.param("messageId");
    const denied = await requireDmParticipant(c.env.DB, channelId, user.sub);
    if (denied) return denied;

    const message = await c.env.DB.prepare(
      "SELECT id, author_id, deleted_at FROM dm_messages WHERE id = ? AND channel_id = ? LIMIT 1",
    )
      .bind(messageId, channelId)
      .first<{ id: string; author_id: string; deleted_at: string | null }>();

    if (!message || message.deleted_at) {
      return jsonError("Message not found.", 404);
    }

    if (message.author_id !== user.sub) {
      return jsonError("You can only delete your own messages.", 403);
    }

    await c.env.DB.prepare(
      "UPDATE dm_messages SET deleted_at = datetime('now'), content = '' WHERE id = ?",
    )
      .bind(messageId)
      .run();

    return c.json({ ok: true });
  });

  app.post("/api/dms/:channelId/attachments", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channelId = c.req.param("channelId");
    const denied = await requireDmParticipant(c.env.DB, channelId, user.sub);
    if (denied) return denied;

    if (!c.env.ATTACHMENTS) {
      return jsonError("File uploads are unavailable.", 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("No file provided.", 400);
    }

    if (file.size > MAX_DM_ATTACHMENT_SIZE) {
      return jsonError("File must be 8 MB or smaller.", 400);
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_DM_ATTACHMENT_TYPES.has(contentType)) {
      return jsonError("File type is not allowed.", 400);
    }

    const privacy = await getPrivacySettings(c.env.DB, user.sub);
    const explicitError = rejectExplicitUpload(file.name, contentType, false, privacy.filterExplicitContent);
    if (explicitError) {
      return jsonError(explicitError, 403);
    }

    const attachmentId = newId();
    const storageKey = `${user.sub}/${attachmentId}/${file.name}`;

    await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
      httpMetadata: { contentType },
    });

    await createPendingDmAttachment(c.env.DB, {
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
        url: `/api/dms/attachments/${attachmentId}`,
      },
    });
  });

  app.get("/api/dms/attachments/:attachmentId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const attachment = await getDmAttachment(c.env.DB, c.req.param("attachmentId"));
    if (!attachment) {
      return jsonError("Attachment not found.", 404);
    }

    if (attachment.message_id) {
      const membership = await c.env.DB.prepare(
        "SELECT 1 FROM dm_participants WHERE channel_id = (SELECT channel_id FROM dm_messages WHERE id = ? LIMIT 1) AND user_id = ? LIMIT 1",
      )
        .bind(attachment.message_id, user.sub)
        .first();

      if (!membership) {
        return jsonError("Attachment not found.", 404);
      }
    } else if (!attachment.storage_key.startsWith(`${user.sub}/`)) {
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
    headers.set("Content-Type", attachment.content_type);
    headers.set("Content-Disposition", `inline; filename="${attachment.filename}"`);
    return new Response(object.body, { headers });
  });

  app.post("/api/dms/group", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as { userIds?: string[]; name?: string };
    const userIds = [...new Set(body.userIds ?? [])].filter((id) => id !== user.sub);

    if (userIds.length < 1 || userIds.length > 7) {
      return jsonError("Group DMs must include 2-8 participants.", 400);
    }

    for (const friendId of userIds) {
      if (!(await areFriends(c.env.DB, user.sub, friendId))) {
        return jsonError("You can only add friends to a group DM.", 403);
      }
    }

    const name = body.name?.trim().slice(0, 100) ?? null;
    const channelId = newId();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO dm_channels (id, name, is_group) VALUES (?, ?, 1)",
      ).bind(channelId, name),
      c.env.DB.prepare(
        "INSERT INTO dm_participants (channel_id, user_id) VALUES (?, ?)",
      ).bind(channelId, user.sub),
    ];

    for (const friendId of userIds) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO dm_participants (channel_id, user_id) VALUES (?, ?)",
        ).bind(channelId, friendId),
      );
    }

    await c.env.DB.batch(statements);
    return c.json({ channelId, isGroup: true, name });
  });

  app.post("/api/servers/:serverId/channels/:channelId/voice/move", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(
        c.env.DB,
        server.id,
        user.sub,
        server.owner_id,
        "move_members",
      ));

    if (!allowed) {
      return jsonError("You do not have permission to move members.", 403);
    }

    const body = (await c.req.json()) as { userId?: string; targetChannelId?: string };
    if (!body.userId || !body.targetChannelId) {
      return jsonError("userId and targetChannelId are required.", 400);
    }

    const sourceChannelId = c.req.param("channelId");
    const sourceChannel = await getServerChannel(c.env.DB, server.id, sourceChannelId);
    const targetChannel = await getServerChannel(c.env.DB, server.id, body.targetChannelId);

    if (!sourceChannel || !targetChannel) {
      return jsonError("Channel not found.", 404);
    }

    if (
      (sourceChannel.type !== "voice" || targetChannel.type !== "voice")
    ) {
      return jsonError("Both channels must be voice channels.", 400);
    }

    if (sourceChannelId === body.targetChannelId) {
      return jsonError("Target channel must be different from the source channel.", 400);
    }

    if (!c.env.VOICE_ROOM) {
      return jsonError("Voice service is unavailable.", 503);
    }

    const roomId = c.env.VOICE_ROOM.idFromName(sourceChannelId);
    const stub = c.env.VOICE_ROOM.get(roomId);
    const response = await stub.fetch(
      new Request("https://voice-room/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: body.userId,
          targetChannelId: body.targetChannelId,
          targetChannelName: targetChannel.name,
          serverId: server.id,
          serverName: server.name,
        }),
      }),
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return jsonError(data.error ?? "Failed to move member.", response.status);
    }

    return c.json({
      ok: true,
      targetChannelId: body.targetChannelId,
      channel: { id: targetChannel.id, name: targetChannel.name, type: targetChannel.type },
    });
  });

  app.get("/api/embed-preview", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const url = c.req.query("url")?.trim() ?? "";
    if (!url || !isAllowedEmbedUrl(url)) {
      return jsonError("A valid public http(s) URL is required.", 400);
    }

    const preview = await fetchEmbedPreview(url);
    if (!preview) {
      return jsonError("Could not fetch embed preview for this URL.", 422);
    }

    return c.json({ embed: preview });
  });

  app.patch(
    "/api/servers/:serverId/channels/:channelId/messages/:messageId/thread",
    async (c) => {
      const user = await requireUser(c);
      if (user instanceof Response) return user;

      const server = await requireServerMember(c, user, c.req.param("serverId"));
      if (server instanceof Response) return server;

      const channelId = c.req.param("channelId");
      const messageId = c.req.param("messageId");

      const canManage =
        server.owner_id === user.sub ||
        (await memberHasPermission(
          c.env.DB,
          server.id,
          user.sub,
          server.owner_id,
          "manage_messages",
        ));

      if (!canManage) {
        return jsonError("You do not have permission to manage threads.", 403);
      }

      const root = await c.env.DB.prepare(
        `SELECT id FROM messages
         WHERE id = ? AND channel_id = ? AND server_id = ? AND thread_root_id IS NULL
         LIMIT 1`,
      )
        .bind(messageId, channelId, server.id)
        .first<{ id: string }>();

      if (!root) {
        return jsonError("Thread root message not found.", 404);
      }

      const body = (await c.req.json()) as { archived?: boolean; locked?: boolean };
      if (body.archived === undefined && body.locked === undefined) {
        return jsonError("Provide archived and/or locked.", 400);
      }

      await ensureMessageThreadColumns(c.env.DB);

      if (body.archived !== undefined) {
        await c.env.DB.prepare("UPDATE messages SET thread_archived = ? WHERE id = ?")
          .bind(body.archived ? 1 : 0, messageId)
          .run();
      }

      if (body.locked !== undefined) {
        await c.env.DB.prepare("UPDATE messages SET thread_locked = ? WHERE id = ?")
          .bind(body.locked ? 1 : 0, messageId)
          .run();
      }

      const message = await getMessageById(c.env.DB, channelId, messageId, user.sub, server.id);
      if (!message) {
        return jsonError("Thread root message not found.", 404);
      }

      await broadcastTextEvent(c.env, channelId, {
        type: "thread-update",
        messageId,
        threadArchived: message.threadArchived,
        threadLocked: message.threadLocked,
      });

      return c.json({
        messageId,
        threadArchived: message.threadArchived,
        threadLocked: message.threadLocked,
      });
    },
  );
}

export { linkDmAttachmentsToMessage, loadDmAttachmentsByMessageIds };
