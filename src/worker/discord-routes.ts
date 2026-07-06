import type { Hono } from "hono";
import { requireUser } from "./lib/session";
import { requireServerMember, requireManageServer } from "./lib/server-access";
import { memberHasPermission } from "./lib/user-permissions";
import { countUnreadMessages } from "./lib/messages";
import { listServerChannels, getServerChannel } from "./lib/channels";
import { writeAuditLog } from "./safety-routes";
import {
  checkAutomod,
  generateInviteCode,
  getMemberTimeout,
  getUserPresence,
  isMemberTimedOut,
  setUserPresence,
  type PresenceStatus,
} from "./lib/discord-features";
import {
  linkDmAttachmentsToMessage,
  loadDmAttachmentsByMessageIds,
} from "./lib/dm-attachments";
import { canInviteUserToVoice, sendVoiceInvite } from "./lib/voice-invites";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}

export function registerDiscordRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/servers/:serverId/channels/unread", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const channels = await listServerChannels(c.env.DB, server.id);
    const unread: Record<string, number> = {};

    for (const channel of channels) {
      if (channel.type === "text") {
        unread[channel.id] = await countUnreadMessages(c.env.DB, channel.id, user.sub);
      }
    }

    return c.json({ unread });
  });

  app.patch("/api/servers/:serverId/members/:userId/nickname", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const targetUserId = c.req.param("userId");
    const body = (await c.req.json().catch(() => ({}))) as { nickname?: string | null };
    const isSelf = targetUserId === user.sub;

    if (!isSelf) {
      const allowed = await memberHasPermission(
        c.env.DB,
        server.id,
        user.sub,
        server.owner_id,
        "manage_nicknames",
      );
      if (!allowed) {
        return jsonError("You do not have permission to manage nicknames.", 403);
      }
    }

    const nickname = body.nickname?.trim() || null;
    if (nickname && nickname.length > 32) {
      return jsonError("Nickname must be 32 characters or fewer.", 400);
    }

    await c.env.DB.prepare("UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?")
      .bind(nickname, server.id, targetUserId)
      .run();

    return c.json({ ok: true, nickname });
  });

  app.post("/api/servers/:serverId/members/:userId/timeout", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const targetUserId = c.req.param("userId");
    if (targetUserId === server.owner_id) {
      return jsonError("You cannot timeout the server owner.", 400);
    }

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "kick_members"));
    if (!allowed) {
      return jsonError("You do not have permission to timeout members.", 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      durationMinutes?: number;
      reason?: string;
    };
    const minutes = Math.min(Math.max(body.durationMinutes ?? 10, 1), 40320);

    const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

    await c.env.DB.prepare(
      `INSERT INTO member_timeouts (server_id, user_id, expires_at, reason, created_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(server_id, user_id) DO UPDATE SET
         expires_at = excluded.expires_at,
         reason = excluded.reason,
         created_by = excluded.created_by,
         created_at = datetime('now')`,
    )
      .bind(server.id, targetUserId, expiresAt, body.reason ?? "", user.sub)
      .run();

    await writeAuditLog(c.env.DB, {
      serverId: server.id,
      actorUserId: user.sub,
      actionType: "member_timeout",
      targetType: "user",
      targetId: targetUserId,
      reason: body.reason ?? null,
      metadata: { durationMinutes: minutes },
    });

    return c.json({ ok: true, expiresAt });
  });

  app.delete("/api/servers/:serverId/members/:userId/timeout", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "kick_members"));
    if (!allowed) {
      return jsonError("You do not have permission to remove timeouts.", 403);
    }

    await c.env.DB.prepare("DELETE FROM member_timeouts WHERE server_id = ? AND user_id = ?")
      .bind(server.id, c.req.param("userId"))
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/presence/me", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const presence = await getUserPresence(c.env.DB, user.sub);
    return c.json({ presence });
  });

  app.patch("/api/presence/me", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as {
      status?: PresenceStatus;
      customStatus?: string | null;
      activityType?: string | null;
      activityName?: string | null;
    };

    const valid: PresenceStatus[] = ["online", "idle", "dnd", "invisible"];
    if (body.status && !valid.includes(body.status)) {
      return jsonError("Invalid presence status.", 400);
    }

    if (body.customStatus && body.customStatus.length > 128) {
      return jsonError("Custom status must be 128 characters or fewer.", 400);
    }

    const current = await getUserPresence(c.env.DB, user.sub);
    await setUserPresence(
      c.env.DB,
      user.sub,
      body.status ?? current.status,
      body.customStatus !== undefined ? body.customStatus : current.customStatus,
      {
        type: body.activityType !== undefined ? body.activityType : current.activityType,
        name: body.activityName !== undefined ? body.activityName : current.activityName,
      },
    );
    return c.json({ ok: true });
  });

  app.get("/api/friends", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const friends = await c.env.DB.prepare(
      `SELECT f.friend_user_id AS user_id, u.username, u.display_name, u.avatar_url
       FROM friendships f
       INNER JOIN users u ON u.id = f.friend_user_id
       WHERE f.user_id = ?
       ORDER BY u.display_name ASC`,
    )
      .bind(user.sub)
      .all<{ user_id: string; username: string; display_name: string; avatar_url: string | null }>();

    const incoming = await c.env.DB.prepare(
      `SELECT fr.id, fr.from_user_id, u.username, u.display_name, fr.created_at
       FROM friend_requests fr
       INNER JOIN users u ON u.id = fr.from_user_id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
    )
      .bind(user.sub)
      .all<{
        id: string;
        from_user_id: string;
        username: string;
        display_name: string;
        created_at: string;
      }>();

    const outgoing = await c.env.DB.prepare(
      `SELECT fr.id, fr.to_user_id, u.username, u.display_name, fr.created_at
       FROM friend_requests fr
       INNER JOIN users u ON u.id = fr.to_user_id
       WHERE fr.from_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
    )
      .bind(user.sub)
      .all<{
        id: string;
        to_user_id: string;
        username: string;
        display_name: string;
        created_at: string;
      }>();

    return c.json({
      friends: (friends.results ?? []).map((f) => ({
        userId: f.user_id,
        username: f.username,
        displayName: f.display_name,
        avatarUrl: f.avatar_url ? `/api/auth/avatars/${f.user_id}` : null,
      })),
      incoming: (incoming.results ?? []).map((r) => ({
        id: r.id,
        userId: r.from_user_id,
        username: r.username,
        displayName: r.display_name,
        createdAt: r.created_at,
      })),
      outgoing: (outgoing.results ?? []).map((r) => ({
        id: r.id,
        userId: r.to_user_id,
        username: r.username,
        displayName: r.display_name,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/friends/request", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as { username?: string };
    if (!body.username?.trim()) {
      return jsonError("Username is required.", 400);
    }

    const target = await c.env.DB.prepare(
      "SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1",
    )
      .bind(body.username.trim())
      .first<{ id: string }>();

    if (!target) {
      return jsonError("User not found.", 404);
    }
    if (target.id === user.sub) {
      return jsonError("You cannot friend yourself.", 400);
    }

    const existing = await c.env.DB.prepare(
      "SELECT id FROM friendships WHERE user_id = ? AND friend_user_id = ? LIMIT 1",
    )
      .bind(user.sub, target.id)
      .first();

    if (existing) {
      return jsonError("You are already friends.", 400);
    }

    const requestId = newId();
    await c.env.DB.prepare(
      `INSERT INTO friend_requests (id, from_user_id, to_user_id, status)
       VALUES (?, ?, ?, 'pending')
       ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET status = 'pending', created_at = datetime('now')`,
    )
      .bind(requestId, user.sub, target.id)
      .run();

    return c.json({ ok: true });
  });

  app.post("/api/friends/request/:requestId/accept", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const request = await c.env.DB.prepare(
      "SELECT id, from_user_id, to_user_id FROM friend_requests WHERE id = ? AND status = 'pending' LIMIT 1",
    )
      .bind(c.req.param("requestId"))
      .first<{ id: string; from_user_id: string; to_user_id: string }>();

    if (!request || request.to_user_id !== user.sub) {
      return jsonError("Friend request not found.", 404);
    }

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").bind(request.id),
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO friendships (user_id, friend_user_id) VALUES (?, ?), (?, ?)",
      ).bind(user.sub, request.from_user_id, request.from_user_id, user.sub),
    ]);

    return c.json({ ok: true });
  });

  app.post("/api/friends/request/:requestId/decline", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    await c.env.DB.prepare(
      "UPDATE friend_requests SET status = 'declined' WHERE id = ? AND to_user_id = ?",
    )
      .bind(c.req.param("requestId"), user.sub)
      .run();

    return c.json({ ok: true });
  });

  app.delete("/api/friends/:userId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const friendId = c.req.param("userId");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM friendships WHERE (user_id = ? AND friend_user_id = ?) OR (user_id = ? AND friend_user_id = ?)",
      ).bind(user.sub, friendId, friendId, user.sub),
      c.env.DB.prepare(
        "DELETE FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)",
      ).bind(user.sub, friendId, friendId, user.sub),
    ]);

    return c.json({ ok: true });
  });

  app.get("/api/dms", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channels = await c.env.DB.prepare(
      `SELECT dc.id, dc.created_at, dc.name, dc.is_group,
              (SELECT content FROM dm_messages WHERE channel_id = dc.id AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM dm_messages WHERE channel_id = dc.id AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM dm_channels dc
       INNER JOIN dm_participants dp ON dp.channel_id = dc.id AND dp.user_id = ?
       ORDER BY COALESCE(last_message_at, dc.created_at) DESC`,
    )
      .bind(user.sub)
      .all<{
        id: string;
        created_at: string;
        name: string | null;
        is_group: number;
        last_message: string | null;
        last_message_at: string | null;
      }>();

    const result = [];
    for (const ch of channels.results ?? []) {
      const participants = await c.env.DB.prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar_url
         FROM dm_participants dp
         INNER JOIN users u ON u.id = dp.user_id
         WHERE dp.channel_id = ? AND dp.user_id != ?`,
      )
        .bind(ch.id, user.sub)
        .all<{ id: string; username: string; display_name: string; avatar_url: string | null }>();

      const participantList = (participants.results ?? []).map((p) => ({
        userId: p.id,
        username: p.username,
        displayName: p.display_name,
        avatarUrl: p.avatar_url ? `/api/auth/avatars/${p.id}` : null,
      }));

      const displayName =
        ch.name?.trim() ||
        (participantList.length === 1
          ? participantList[0].displayName
          : participantList.length > 1
            ? participantList.map((p) => p.displayName).join(", ")
            : "Direct Message");

      result.push({
        id: ch.id,
        createdAt: ch.created_at,
        lastMessage: ch.last_message,
        lastMessageAt: ch.last_message_at,
        isGroup: ch.is_group === 1 || participantList.length > 1,
        name: displayName,
        participants: participantList,
      });
    }

    return c.json({ channels: result });
  });

  app.post("/api/dms/open", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as { userId?: string };
    if (!body.userId) {
      return jsonError("userId is required.", 400);
    }

    const existing = await c.env.DB.prepare(
      `SELECT dc.id FROM dm_channels dc
       INNER JOIN dm_participants p1 ON p1.channel_id = dc.id AND p1.user_id = ?
       INNER JOIN dm_participants p2 ON p2.channel_id = dc.id AND p2.user_id = ?
       LIMIT 1`,
    )
      .bind(user.sub, body.userId)
      .first<{ id: string }>();

    if (existing) {
      return c.json({ channelId: existing.id });
    }

    const channelId = newId();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO dm_channels (id) VALUES (?)").bind(channelId),
      c.env.DB.prepare(
        "INSERT INTO dm_participants (channel_id, user_id) VALUES (?, ?), (?, ?)",
      ).bind(channelId, user.sub, channelId, body.userId),
    ]);

    return c.json({ channelId });
  });

  app.get("/api/dms/:channelId/messages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channelId = c.req.param("channelId");
    const membership = await c.env.DB.prepare(
      "SELECT 1 FROM dm_participants WHERE channel_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(channelId, user.sub)
      .first();

    if (!membership) {
      return jsonError("DM channel not found.", 404);
    }

    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const rows = await c.env.DB.prepare(
      `SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at, m.edited_at,
              u.username, u.display_name, u.avatar_url
       FROM dm_messages m
       INNER JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT ?`,
    )
      .bind(channelId, limit)
      .all<{
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

    const messages = (rows.results ?? []).reverse();
    const attachmentMap = await loadDmAttachmentsByMessageIds(
      c.env.DB,
      messages.map((m) => m.id),
    );
    const withReactions = [];
    for (const m of messages) {
      const reactions = await c.env.DB.prepare(
        `SELECT emoji, COUNT(*) AS count FROM dm_reactions WHERE message_id = ? GROUP BY emoji`,
      )
        .bind(m.id)
        .all<{ emoji: string; count: number }>();

      const myReactions = await c.env.DB.prepare(
        "SELECT emoji FROM dm_reactions WHERE message_id = ? AND user_id = ?",
      )
        .bind(m.id, user.sub)
        .all<{ emoji: string }>();

      const mySet = new Set((myReactions.results ?? []).map((r) => r.emoji));

      withReactions.push({
        id: m.id,
        channelId: m.channel_id,
        author: {
          id: m.author_id,
          username: m.username,
          displayName: m.display_name,
          avatarUrl: m.avatar_url ? `/api/auth/avatars/${m.author_id}` : null,
        },
        content: m.content,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        attachments: attachmentMap.get(m.id) ?? [],
        reactions: (reactions.results ?? []).map((r) => ({
          emoji: r.emoji,
          count: r.count,
          me: mySet.has(r.emoji),
        })),
      });
    }

    return c.json({ messages: withReactions });
  });

  app.post("/api/dms/:channelId/messages", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const channelId = c.req.param("channelId");
    const membership = await c.env.DB.prepare(
      "SELECT 1 FROM dm_participants WHERE channel_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(channelId, user.sub)
      .first();

    if (!membership) {
      return jsonError("DM channel not found.", 404);
    }

    const body = (await c.req.json()) as { content?: string; attachmentIds?: string[] };
    const content = body.content?.trim() ?? "";
    const attachmentIds = body.attachmentIds ?? [];
    if ((!content && attachmentIds.length === 0) || content.length > 2000) {
      return jsonError("Message must be 1-2000 characters or include attachments.", 400);
    }

    const messageId = newId();
    await c.env.DB.prepare(
      "INSERT INTO dm_messages (id, channel_id, author_id, content) VALUES (?, ?, ?, ?)",
    )
      .bind(messageId, channelId, user.sub, content)
      .run();

    if (attachmentIds.length > 0) {
      await linkDmAttachmentsToMessage(c.env.DB, messageId, attachmentIds, user.sub);
    }

    const profile = await c.env.DB.prepare(
      "SELECT username, display_name FROM users WHERE id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ username: string; display_name: string }>();

    const attachments = await loadDmAttachmentsByMessageIds(c.env.DB, [messageId]);

    return c.json({
      message: {
        id: messageId,
        channelId,
        author: {
          id: user.sub,
          username: profile?.username ?? "",
          displayName: profile?.display_name ?? "",
        },
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        attachments: attachments.get(messageId) ?? [],
      },
    });
  });

  app.get("/api/servers/:serverId/search", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const q = c.req.query("q")?.trim() ?? "";
    if (q.length < 2) {
      return jsonError("Search query must be at least 2 characters.", 400);
    }

    const rows = await c.env.DB.prepare(
      `SELECT m.id, m.channel_id, m.content, m.created_at, c.name AS channel_name,
              u.username, u.display_name
       FROM messages m
       INNER JOIN channels c ON c.id = m.channel_id
       INNER JOIN users u ON u.id = m.author_id
       WHERE m.server_id = ? AND m.deleted_at IS NULL AND m.thread_root_id IS NULL
         AND m.content LIKE ?
       ORDER BY m.created_at DESC LIMIT 25`,
    )
      .bind(server.id, `%${q}%`)
      .all<{
        id: string;
        channel_id: string;
        content: string;
        created_at: string;
        channel_name: string;
        username: string;
        display_name: string;
      }>();

    return c.json({
      results: (rows.results ?? []).map((r) => ({
        messageId: r.id,
        channelId: r.channel_id,
        channelName: r.channel_name,
        content: r.content,
        createdAt: r.created_at,
        author: { username: r.username, displayName: r.display_name },
      })),
    });
  });

  app.post("/api/servers/:serverId/reports", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const body = (await c.req.json()) as {
      targetType?: "message" | "user";
      targetId?: string;
      reason?: string;
    };

    if (!body.targetType || !body.targetId || !body.reason?.trim()) {
      return jsonError("targetType, targetId, and reason are required.", 400);
    }

    const reportId = newId();
    await c.env.DB.prepare(
      `INSERT INTO moderation_reports (id, server_id, reporter_user_id, target_type, target_id, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(reportId, server.id, user.sub, body.targetType, body.targetId, body.reason.trim())
      .run();

    return c.json({ ok: true, reportId });
  });

  app.get("/api/servers/:serverId/reports", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_messages"));
    if (!allowed) {
      return jsonError("You do not have permission to view reports.", 403);
    }

    const rows = await c.env.DB.prepare(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
              u.username AS reporter_username
       FROM moderation_reports r
       INNER JOIN users u ON u.id = r.reporter_user_id
       WHERE r.server_id = ?
       ORDER BY r.created_at DESC LIMIT 50`,
    )
      .bind(server.id)
      .all<{
        id: string;
        target_type: string;
        target_id: string;
        reason: string;
        status: string;
        created_at: string;
        reporter_username: string;
      }>();

    return c.json({
      reports: (rows.results ?? []).map((r) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        reporterUsername: r.reporter_username,
      })),
    });
  });

  app.patch("/api/servers/:serverId/reports/:reportId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_messages"));
    if (!allowed) {
      return jsonError("You do not have permission to manage reports.", 403);
    }

    const body = (await c.req.json()) as { status?: "resolved" | "dismissed" };
    if (!body.status) {
      return jsonError("status is required.", 400);
    }

    await c.env.DB.prepare("UPDATE moderation_reports SET status = ? WHERE id = ? AND server_id = ?")
      .bind(body.status, c.req.param("reportId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/invites", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canView =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "create_invite"));
    if (!canView) {
      return jsonError("You do not have permission to view invites.", 403);
    }

    const rows = await c.env.DB.prepare(
      `SELECT si.id, si.code, si.max_uses, si.uses, si.expires_at, si.created_at, u.username AS creator_username
       FROM server_invites si
       INNER JOIN users u ON u.id = si.creator_id
       WHERE si.server_id = ?
       ORDER BY si.created_at DESC`,
    )
      .bind(server.id)
      .all<{
        id: string;
        code: string;
        max_uses: number | null;
        uses: number;
        expires_at: string | null;
        created_at: string;
        creator_username: string;
      }>();

    return c.json({
      invites: (rows.results ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        maxUses: r.max_uses,
        uses: r.uses,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        creatorUsername: r.creator_username,
      })),
    });
  });

  app.post("/api/servers/:serverId/invites", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canCreate = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "create_invite",
    );
    if (!canCreate) {
      return jsonError("You do not have permission to create invites.", 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      maxUses?: number | null;
      expiresInHours?: number | null;
    };

    const inviteId = newId();
    let code = generateInviteCode();
    let expiresAt: string | null = null;

    if (body.expiresInHours) {
      expiresAt = new Date(Date.now() + body.expiresInHours * 3_600_000).toISOString();
    }

    await c.env.DB.prepare(
      `INSERT INTO server_invites (id, server_id, code, creator_id, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(inviteId, server.id, code, user.sub, body.maxUses ?? null, expiresAt)
      .run();

    return c.json({ invite: { id: inviteId, code, maxUses: body.maxUses ?? null, expiresAt } });
  });

  app.delete("/api/servers/:serverId/invites/:inviteId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "create_invite",
    );
    if (!canManage) {
      return jsonError("You do not have permission to delete invites.", 403);
    }

    await c.env.DB.prepare("DELETE FROM server_invites WHERE id = ? AND server_id = ?")
      .bind(c.req.param("inviteId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/automod", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, enabled, trigger_type, action, config, created_at FROM automod_rules WHERE server_id = ?",
    )
      .bind(server.id)
      .all<{
        id: string;
        name: string;
        enabled: number;
        trigger_type: string;
        action: string;
        config: string;
        created_at: string;
      }>();

    return c.json({
      rules: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled === 1,
        triggerType: r.trigger_type,
        action: r.action,
        config: JSON.parse(r.config || "{}"),
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/automod", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const body = (await c.req.json()) as {
      name?: string;
      triggerType?: string;
      action?: string;
      config?: Record<string, unknown>;
    };

    if (!body.name || !body.triggerType || !body.action) {
      return jsonError("name, triggerType, and action are required.", 400);
    }

    const ruleId = newId();
    await c.env.DB.prepare(
      `INSERT INTO automod_rules (id, server_id, name, trigger_type, action, config)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(ruleId, server.id, body.name, body.triggerType, body.action, JSON.stringify(body.config ?? {}))
      .run();

    return c.json({ ok: true, ruleId });
  });

  app.delete("/api/servers/:serverId/automod/:ruleId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    await c.env.DB.prepare("DELETE FROM automod_rules WHERE id = ? AND server_id = ?")
      .bind(c.req.param("ruleId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/rules", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const row = await c.env.DB.prepare(
      "SELECT rules_text, require_rules_acceptance FROM servers WHERE id = ? LIMIT 1",
    )
      .bind(server.id)
      .first<{ rules_text: string; require_rules_acceptance: number }>();

    const accepted = await c.env.DB.prepare(
      "SELECT 1 FROM member_rules_acceptance WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(server.id, user.sub)
      .first();

    return c.json({
      rulesText: row?.rules_text ?? "",
      requireAcceptance: (row?.require_rules_acceptance ?? 0) === 1,
      accepted: Boolean(accepted),
    });
  });

  app.post("/api/servers/:serverId/rules/accept", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO member_rules_acceptance (server_id, user_id) VALUES (?, ?)",
    )
      .bind(server.id, user.sub)
      .run();

    return c.json({ ok: true });
  });

  app.patch("/api/servers/:serverId/rules", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const body = (await c.req.json()) as {
      rulesText?: string;
      requireAcceptance?: boolean;
    };

    if (body.rulesText !== undefined) {
      await c.env.DB.prepare("UPDATE servers SET rules_text = ? WHERE id = ?")
        .bind(body.rulesText, server.id)
        .run();
    }
    if (body.requireAcceptance !== undefined) {
      await c.env.DB.prepare("UPDATE servers SET require_rules_acceptance = ? WHERE id = ?")
        .bind(body.requireAcceptance ? 1 : 0, server.id)
        .run();
    }

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/categories", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, position FROM channel_categories WHERE server_id = ? ORDER BY position ASC",
    )
      .bind(server.id)
      .all<{ id: string; name: string; position: number }>();

    return c.json({
      categories: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
      })),
    });
  });

  app.post("/api/servers/:serverId/categories", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "manage_channels",
    );
    if (!canManage) {
      return jsonError("You do not have permission to manage channels.", 403);
    }

    const body = (await c.req.json()) as { name?: string };
    if (!body.name?.trim()) {
      return jsonError("Category name is required.", 400);
    }

    const maxPos = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(position), -1) AS max_pos FROM channel_categories WHERE server_id = ?",
    )
      .bind(server.id)
      .first<{ max_pos: number }>();

    const categoryId = newId();
    await c.env.DB.prepare(
      "INSERT INTO channel_categories (id, server_id, name, position) VALUES (?, ?, ?, ?)",
    )
      .bind(categoryId, server.id, body.name.trim(), (maxPos?.max_pos ?? -1) + 1)
      .run();

    return c.json({ category: { id: categoryId, name: body.name.trim(), position: (maxPos?.max_pos ?? -1) + 1 } });
  });

  app.post("/api/servers/:serverId/channels/:channelId/voice/moderate", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canMute = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "mute_members",
    );
    const canDeafen = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "deafen_members",
    );

    if (!canMute && !canDeafen) {
      return jsonError("You do not have permission to moderate voice.", 403);
    }

    const body = (await c.req.json()) as {
      userId?: string;
      serverMuted?: boolean;
      serverDeafened?: boolean;
    };

    if (!body.userId || !c.env.VOICE_ROOM) {
      return jsonError("Invalid request.", 400);
    }

    const channelId = c.req.param("channelId");
    const roomId = c.env.VOICE_ROOM.idFromName(channelId);
    const stub = c.env.VOICE_ROOM.get(roomId);

    const response = await stub.fetch(
      new Request("https://voice-room/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: body.userId,
          serverMuted: canMute ? body.serverMuted : undefined,
          serverDeafened: canDeafen ? body.serverDeafened : undefined,
        }),
      }),
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return jsonError(data.error ?? "Voice moderation failed.", response.status);
    }

    return c.json({ ok: true });
  });

  app.post("/api/servers/:serverId/channels/:channelId/voice/invite", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const channelId = c.req.param("channelId");
    const channel = await getServerChannel(c.env.DB, server.id, channelId);
    if (!channel) {
      return jsonError("Channel not found.", 404);
    }
    if (channel.type !== "voice") {
      return jsonError("This channel is not a voice channel.", 400);
    }

    const body = (await c.req.json()) as { userId?: string };
    if (!body.userId?.trim()) {
      return jsonError("userId is required.", 400);
    }

    const targetUserId = body.userId.trim();
    const allowed = await canInviteUserToVoice(
      c.env.DB,
      user.sub,
      targetUserId,
      server.id,
    );
    if (!allowed.ok) {
      return jsonError(allowed.reason, 403);
    }

    const profile = await c.env.DB.prepare(
      "SELECT display_name FROM users WHERE id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ display_name: string }>();

    let displayName = profile?.display_name ?? user.displayName ?? "Someone";
    try {
      const nicknameRow = await c.env.DB.prepare(
        "SELECT nickname FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
      )
        .bind(server.id, user.sub)
        .first<{ nickname: string | null }>();
      if (nicknameRow?.nickname?.trim()) {
        displayName = nicknameRow.nickname.trim();
      }
    } catch {
      // nickname column may not exist before migration.
    }

    const result = await sendVoiceInvite({
      db: c.env.DB,
      serverId: server.id,
      serverName: server.name,
      channelId: channel.id,
      channelName: channel.name,
      fromUserId: user.sub,
      fromDisplayName: displayName,
      toUserId: targetUserId,
    });

    return c.json({
      ok: true,
      inviteId: result.inviteId,
      alreadySent: result.alreadySent,
    });
  });
}

export { isMemberTimedOut, getMemberTimeout, checkAutomod };
