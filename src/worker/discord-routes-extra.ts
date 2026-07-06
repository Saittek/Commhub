import type { Hono } from "hono";
import { requireUser } from "./lib/session";
import { requireServerMember, requireManageServer } from "./lib/server-access";
import { memberHasPermission } from "./lib/user-permissions";
import {
  deleteChannelOverwrite,
  getChannelOverwrites,
  upsertChannelOverwrite,
} from "./lib/channel-permissions";
import { type RolePermissions } from "./lib/permissions";
import { hashWebhookToken, generateWebhookToken } from "./lib/webhooks";
import { broadcastTextEvent } from "./message-routes";
import { setUserPresence, type PresenceStatus } from "./lib/discord-features";
import { getServerBoostPerks } from "./lib/boost-limits";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}

const EMOJI_TYPES = new Set(["image/png", "image/gif", "image/webp", "image/jpeg"]);
const MAX_EMOJI_BYTES = 256 * 1024;

export function registerDiscordExtraRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/servers/:serverId/channels/:channelId/notifications", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const channelId = c.req.param("channelId");
    const row = await c.env.DB.prepare(
      "SELECT level FROM channel_notification_settings WHERE user_id = ? AND channel_id = ? LIMIT 1",
    )
      .bind(user.sub, channelId)
      .first<{ level: string }>();

    return c.json({ level: row?.level ?? "inherit" });
  });

  app.patch("/api/servers/:serverId/channels/:channelId/notifications", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const body = (await c.req.json()) as { level?: string };
    const valid = ["inherit", "all", "mentions", "nothing"];
    if (!body.level || !valid.includes(body.level)) {
      return jsonError("Invalid notification level.", 400);
    }

    await c.env.DB.prepare(
      `INSERT INTO channel_notification_settings (user_id, channel_id, level)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, channel_id) DO UPDATE SET level = excluded.level`,
    )
      .bind(user.sub, c.req.param("channelId"), body.level)
      .run();

    return c.json({ ok: true, level: body.level });
  });

  app.get("/api/servers/:serverId/channels/:channelId/overwrites", async (c) => {
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
      return jsonError("You do not have permission to view overwrites.", 403);
    }

    const overwrites = await getChannelOverwrites(c.env.DB, c.req.param("channelId"));
    return c.json({ overwrites });
  });

  app.put("/api/servers/:serverId/channels/:channelId/overwrites", async (c) => {
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
      return jsonError("You do not have permission to edit overwrites.", 403);
    }

    const body = (await c.req.json()) as {
      targetType?: "role" | "member";
      targetId?: string;
      allow?: RolePermissions;
      deny?: RolePermissions;
    };

    if (!body.targetType || !body.targetId) {
      return jsonError("targetType and targetId are required.", 400);
    }

    const id = await upsertChannelOverwrite(
      c.env.DB,
      c.req.param("channelId"),
      body.targetType,
      body.targetId,
      body.allow ?? {},
      body.deny ?? {},
    );

    return c.json({ ok: true, id });
  });

  app.delete("/api/servers/:serverId/channels/:channelId/overwrites/:overwriteId", async (c) => {
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
      return jsonError("You do not have permission to delete overwrites.", 403);
    }

    await deleteChannelOverwrite(c.env.DB, c.req.param("overwriteId"));
    return c.json({ ok: true });
  });

  app.patch("/api/servers/:serverId/categories/:categoryId", async (c) => {
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
      return jsonError("You do not have permission to manage categories.", 403);
    }

    const body = (await c.req.json()) as { name?: string; position?: number };
    if (body.name !== undefined) {
      await c.env.DB.prepare(
        "UPDATE channel_categories SET name = ? WHERE id = ? AND server_id = ?",
      )
        .bind(body.name.trim(), c.req.param("categoryId"), server.id)
        .run();
    }
    if (body.position !== undefined) {
      await c.env.DB.prepare(
        "UPDATE channel_categories SET position = ? WHERE id = ? AND server_id = ?",
      )
        .bind(body.position, c.req.param("categoryId"), server.id)
        .run();
    }

    return c.json({ ok: true });
  });

  app.delete("/api/servers/:serverId/categories/:categoryId", async (c) => {
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
      return jsonError("You do not have permission to delete categories.", 403);
    }

    const categoryId = c.req.param("categoryId");
    await c.env.DB.prepare("UPDATE channels SET category_id = NULL WHERE category_id = ?")
      .bind(categoryId)
      .run();
    await c.env.DB.prepare("DELETE FROM channel_categories WHERE id = ? AND server_id = ?")
      .bind(categoryId, server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/emojis", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, image_url, created_at FROM server_emojis WHERE server_id = ? ORDER BY name ASC",
    )
      .bind(server.id)
      .all<{ id: string; name: string; image_url: string; created_at: string }>();

    return c.json({
      emojis: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        url: `/api/servers/${server.id}/emojis/${r.id}`,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/emojis", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    if (!c.env.ATTACHMENTS) {
      return jsonError("Storage unavailable.", 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (!(file instanceof File) || !name) {
      return jsonError("file and name are required.", 400);
    }
    if (!EMOJI_TYPES.has(file.type) || file.size > MAX_EMOJI_BYTES) {
      return jsonError("Emoji must be PNG/GIF/WebP/JPEG under 256KB.", 400);
    }

    const perks = await getServerBoostPerks(c.env.DB, server.id);
    const emojiCount = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM server_emojis WHERE server_id = ?",
    )
      .bind(server.id)
      .first<{ count: number }>();
    if ((emojiCount?.count ?? 0) >= perks.emojiSlots) {
      return jsonError(`Emoji slots full (${perks.emojiSlots} at boost level ${perks.boostLevel}).`, 400);
    }

    const emojiId = newId();
    const ext = file.type === "image/gif" ? "gif" : file.type === "image/webp" ? "webp" : "png";
    const storageKey = `emojis/${server.id}/${emojiId}.${ext}`;

    await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    await c.env.DB.prepare(
      "INSERT INTO server_emojis (id, server_id, name, image_url, created_by) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(emojiId, server.id, name, storageKey, user.sub)
      .run();

    return c.json({
      emoji: { id: emojiId, name, url: `/api/servers/${server.id}/emojis/${emojiId}` },
    });
  });

  app.get("/api/servers/:serverId/emojis/:emojiId", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT image_url FROM server_emojis WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("emojiId"), c.req.param("serverId"))
      .first<{ image_url: string }>();

    if (!row || !c.env.ATTACHMENTS) {
      return jsonError("Emoji not found.", 404);
    }

    const object = await c.env.ATTACHMENTS.get(row.image_url);
    if (!object) {
      return jsonError("Emoji not found.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(object.body, { headers });
  });

  app.delete("/api/servers/:serverId/emojis/:emojiId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const row = await c.env.DB.prepare(
      "SELECT image_url FROM server_emojis WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("emojiId"), server.id)
      .first<{ image_url: string }>();

    if (row && c.env.ATTACHMENTS) {
      await c.env.ATTACHMENTS.delete(row.image_url);
    }

    await c.env.DB.prepare("DELETE FROM server_emojis WHERE id = ? AND server_id = ?")
      .bind(c.req.param("emojiId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/stickers", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, description, image_url, created_at FROM server_stickers WHERE server_id = ?",
    )
      .bind(server.id)
      .all<{ id: string; name: string; description: string; image_url: string; created_at: string }>();

    return c.json({
      stickers: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        url: `/api/servers/${server.id}/stickers/${r.id}`,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/stickers", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    if (!c.env.ATTACHMENTS) {
      return jsonError("Storage unavailable.", 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const description = String(formData.get("description") ?? "").trim().slice(0, 200);

    if (!(file instanceof File) || !name) {
      return jsonError("file and name are required.", 400);
    }
    if (!EMOJI_TYPES.has(file.type) || file.size > 512 * 1024) {
      return jsonError("Sticker must be an image under 512KB.", 400);
    }

    const stickerId = newId();
    const ext = file.type === "image/gif" ? "gif" : "png";
    const storageKey = `stickers/${server.id}/${stickerId}.${ext}`;

    await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    await c.env.DB.prepare(
      "INSERT INTO server_stickers (id, server_id, name, description, image_url, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(stickerId, server.id, name, description, storageKey, user.sub)
      .run();

    return c.json({
      sticker: {
        id: stickerId,
        name,
        url: `/api/servers/${server.id}/stickers/${stickerId}`,
      },
    });
  });

  app.get("/api/servers/:serverId/stickers/:stickerId", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT image_url FROM server_stickers WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("stickerId"), c.req.param("serverId"))
      .first<{ image_url: string }>();

    if (!row || !c.env.ATTACHMENTS) {
      return jsonError("Sticker not found.", 404);
    }

    const object = await c.env.ATTACHMENTS.get(row.image_url);
    if (!object) {
      return jsonError("Sticker not found.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  });

  app.delete("/api/servers/:serverId/stickers/:stickerId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const row = await c.env.DB.prepare(
      "SELECT image_url FROM server_stickers WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("stickerId"), server.id)
      .first<{ image_url: string }>();

    if (row && c.env.ATTACHMENTS) {
      await c.env.ATTACHMENTS.delete(row.image_url);
    }

    await c.env.DB.prepare("DELETE FROM server_stickers WHERE id = ? AND server_id = ?")
      .bind(c.req.param("stickerId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/webhooks", async (c) => {
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
      return jsonError("You do not have permission to view webhooks.", 403);
    }

    const rows = await c.env.DB.prepare(
      `SELECT w.id, w.channel_id, w.name, w.created_at, c.name AS channel_name
       FROM channel_webhooks w
       INNER JOIN channels c ON c.id = w.channel_id
       WHERE w.server_id = ?`,
    )
      .bind(server.id)
      .all<{ id: string; channel_id: string; name: string; created_at: string; channel_name: string }>();

    return c.json({
      webhooks: (rows.results ?? []).map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        channelName: r.channel_name,
        name: r.name,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/channels/:channelId/webhooks", async (c) => {
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
      return jsonError("You do not have permission to create webhooks.", 403);
    }

    const body = (await c.req.json()) as { name?: string };
    if (!body.name?.trim()) {
      return jsonError("Webhook name is required.", 400);
    }

    const webhookId = newId();
    const token = generateWebhookToken();
    const tokenHash = await hashWebhookToken(token);

    await c.env.DB.prepare(
      `INSERT INTO channel_webhooks (id, channel_id, server_id, name, token_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(webhookId, c.req.param("channelId"), server.id, body.name.trim(), tokenHash, user.sub)
      .run();

    return c.json({
      webhook: {
        id: webhookId,
        name: body.name.trim(),
        token,
        url: `/api/webhooks/${webhookId}/${token}`,
      },
    });
  });

  app.delete("/api/servers/:serverId/webhooks/:webhookId", async (c) => {
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
      return jsonError("You do not have permission to delete webhooks.", 403);
    }

    await c.env.DB.prepare("DELETE FROM channel_webhooks WHERE id = ? AND server_id = ?")
      .bind(c.req.param("webhookId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.post("/api/webhooks/:webhookId/:token", async (c) => {
    const webhookId = c.req.param("webhookId");
    const token = c.req.param("token");
    const tokenHash = await hashWebhookToken(token);

    const webhook = await c.env.DB.prepare(
      "SELECT id, channel_id, server_id, name, created_by FROM channel_webhooks WHERE id = ? AND token_hash = ? LIMIT 1",
    )
      .bind(webhookId, tokenHash)
      .first<{ id: string; channel_id: string; server_id: string; name: string; created_by: string }>();

    if (!webhook) {
      return jsonError("Invalid webhook.", 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content || content.length > 2000) {
      return jsonError("content must be 1-2000 characters.", 400);
    }

    const messageId = newId();

    await c.env.DB.prepare(
      `INSERT INTO messages (id, channel_id, server_id, author_id, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        messageId,
        webhook.channel_id,
        webhook.server_id,
        webhook.created_by,
        `**${webhook.name}**: ${content}`,
      )
      .run();

    await broadcastTextEvent(c.env, webhook.channel_id, {
      type: "message-create",
      channelId: webhook.channel_id,
    });

    return c.json({ ok: true, messageId });
  });

  app.get("/api/servers/:serverId/commands", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, description, response_text, created_at FROM slash_commands WHERE server_id = ?",
    )
      .bind(server.id)
      .all<{ id: string; name: string; description: string; response_text: string; created_at: string }>();

    return c.json({
      commands: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        responseText: r.response_text,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/commands", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    const body = (await c.req.json()) as {
      name?: string;
      description?: string;
      responseText?: string;
    };

    const name = body.name?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") ?? "";
    if (!name || name.length < 2) {
      return jsonError("Command name must be 2+ characters.", 400);
    }
    if (!body.responseText?.trim()) {
      return jsonError("responseText is required.", 400);
    }

    const commandId = newId();
    await c.env.DB.prepare(
      `INSERT INTO slash_commands (id, server_id, name, description, response_text, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(commandId, server.id, name, body.description ?? "", body.responseText.trim(), user.sub)
      .run();

    return c.json({ ok: true, commandId });
  });

  app.delete("/api/servers/:serverId/commands/:commandId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const manage = await requireManageServer(c, user, server);
    if (manage instanceof Response) return manage;

    await c.env.DB.prepare("DELETE FROM slash_commands WHERE id = ? AND server_id = ?")
      .bind(c.req.param("commandId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/server-folders", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const folders = await c.env.DB.prepare(
      "SELECT id, name, position, color FROM user_server_folders WHERE user_id = ? ORDER BY position ASC",
    )
      .bind(user.sub)
      .all<{ id: string; name: string; position: number; color: string }>();

    const result = [];
    for (const folder of folders.results ?? []) {
      const items = await c.env.DB.prepare(
        "SELECT server_id, position FROM user_server_folder_items WHERE folder_id = ? ORDER BY position ASC",
      )
        .bind(folder.id)
        .all<{ server_id: string; position: number }>();

      result.push({
        id: folder.id,
        name: folder.name,
        position: folder.position,
        color: folder.color,
        serverIds: (items.results ?? []).map((i) => i.server_id),
      });
    }

    return c.json({ folders: result });
  });

  app.post("/api/server-folders", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as { name?: string; color?: string };
    if (!body.name?.trim()) {
      return jsonError("Folder name is required.", 400);
    }

    const folderId = newId();
    const maxPos = await c.env.DB.prepare(
      "SELECT COALESCE(MAX(position), -1) AS max_pos FROM user_server_folders WHERE user_id = ?",
    )
      .bind(user.sub)
      .first<{ max_pos: number }>();

    await c.env.DB.prepare(
      "INSERT INTO user_server_folders (id, user_id, name, position, color) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(folderId, user.sub, body.name.trim(), (maxPos?.max_pos ?? -1) + 1, body.color ?? "#14b8a6")
      .run();

    return c.json({ folder: { id: folderId, name: body.name.trim() } });
  });

  app.patch("/api/server-folders/:folderId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as {
      name?: string;
      color?: string;
      serverIds?: string[];
    };

    const folder = await c.env.DB.prepare(
      "SELECT id FROM user_server_folders WHERE id = ? AND user_id = ? LIMIT 1",
    )
      .bind(c.req.param("folderId"), user.sub)
      .first();

    if (!folder) {
      return jsonError("Folder not found.", 404);
    }

    if (body.name !== undefined) {
      await c.env.DB.prepare("UPDATE user_server_folders SET name = ? WHERE id = ?")
        .bind(body.name.trim(), c.req.param("folderId"))
        .run();
    }
    if (body.color !== undefined) {
      await c.env.DB.prepare("UPDATE user_server_folders SET color = ? WHERE id = ?")
        .bind(body.color, c.req.param("folderId"))
        .run();
    }
    if (body.serverIds !== undefined) {
      await c.env.DB.prepare("DELETE FROM user_server_folder_items WHERE folder_id = ?")
        .bind(c.req.param("folderId"))
        .run();
      for (let i = 0; i < body.serverIds.length; i++) {
        await c.env.DB.prepare(
          "INSERT INTO user_server_folder_items (folder_id, server_id, position) VALUES (?, ?, ?)",
        )
          .bind(c.req.param("folderId"), body.serverIds[i], i)
          .run();
      }
    }

    return c.json({ ok: true });
  });

  app.delete("/api/server-folders/:folderId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    await c.env.DB.prepare("DELETE FROM user_server_folders WHERE id = ? AND user_id = ?")
      .bind(c.req.param("folderId"), user.sub)
      .run();

    return c.json({ ok: true });
  });

  app.post("/api/dms/:channelId/messages/:messageId/reactions", async (c) => {
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

    const body = (await c.req.json()) as { emoji?: string };
    const emoji = body.emoji?.trim();
    if (!emoji || emoji.length > 32) {
      return jsonError("Invalid emoji.", 400);
    }

    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO dm_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
    )
      .bind(c.req.param("messageId"), user.sub, emoji)
      .run();

    return c.json({ ok: true });
  });

  app.delete("/api/dms/:channelId/messages/:messageId/reactions/:emoji", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    await c.env.DB.prepare(
      "DELETE FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
    )
      .bind(c.req.param("messageId"), user.sub, decodeURIComponent(c.req.param("emoji")))
      .run();

    return c.json({ ok: true });
  });

  app.patch("/api/presence/me/activity", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as {
      status?: PresenceStatus;
      customStatus?: string | null;
      activityType?: string | null;
      activityName?: string | null;
    };

    const current = await c.env.DB.prepare(
      "SELECT status, custom_status FROM user_presence WHERE user_id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ status: PresenceStatus; custom_status: string | null }>();

    await setUserPresence(
      c.env.DB,
      user.sub,
      body.status ?? current?.status ?? "online",
      body.customStatus ?? current?.custom_status ?? null,
      { type: body.activityType, name: body.activityName },
    );

    return c.json({ ok: true });
  });
}
