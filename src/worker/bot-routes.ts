import type { Hono } from "hono";
import { requireUser } from "./lib/session";
import { requireServerMember } from "./lib/server-access";
import { memberHasPermission } from "./lib/user-permissions";
import {
  generateBotToken,
  hashBotToken,
  requireBot,
  requireBotForServer,
} from "./lib/bot-auth";
import { getServerChannel } from "./lib/channels";
import { broadcastTextEvent } from "./message-routes";
import { getMessageById } from "./lib/messages";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}
export function registerBotRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/applications", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, description, created_at FROM bot_applications WHERE owner_user_id = ? ORDER BY created_at DESC",
    )
      .bind(user.sub)
      .all<{ id: string; name: string; description: string; created_at: string }>();

    return c.json({
      applications: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/applications", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as { name?: string; description?: string };
    const name = body.name?.trim();
    if (!name || name.length > 32) {
      return jsonError("Application name must be 1-32 characters.", 400);
    }

    const appId = newId();
    const botUserId = newId();
    const username = `bot-${appId.slice(0, 8)}`;

    await c.env.DB.batch([
      c.env.DB
        .prepare(
          "INSERT INTO bot_applications (id, owner_user_id, name, description) VALUES (?, ?, ?, ?)",
        )
        .bind(appId, user.sub, name, body.description?.trim() ?? ""),
      c.env.DB
        .prepare(
          `INSERT INTO users (id, username, email, password_hash, password_salt, display_name, is_bot, email_verified)
           VALUES (?, ?, '', '', '', ?, 1, 1)`,
        )
        .bind(botUserId, username, `${name}`),
    ]);

    const token = generateBotToken();
    const tokenHash = await hashBotToken(token);
    await c.env.DB.prepare(
      "INSERT INTO bot_tokens (id, application_id, token_hash) VALUES (?, ?, ?)",
    )
      .bind(newId(), appId, tokenHash)
      .run();

    return c.json({
      application: { id: appId, name, description: body.description?.trim() ?? "" },
      token,
      botUserId,
    });
  });

  app.post("/api/applications/:appId/token/regenerate", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const app = await c.env.DB.prepare(
      "SELECT id FROM bot_applications WHERE id = ? AND owner_user_id = ? LIMIT 1",
    )
      .bind(c.req.param("appId"), user.sub)
      .first<{ id: string }>();

    if (!app) {
      return jsonError("Application not found.", 404);
    }

    await c.env.DB.prepare("DELETE FROM bot_tokens WHERE application_id = ?").bind(app.id).run();

    const token = generateBotToken();
    const tokenHash = await hashBotToken(token);
    await c.env.DB.prepare(
      "INSERT INTO bot_tokens (id, application_id, token_hash) VALUES (?, ?, ?)",
    )
      .bind(newId(), app.id, tokenHash)
      .run();

    return c.json({ token });
  });

  app.get("/api/servers/:serverId/bots", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      `SELECT ba.id, ba.name, ba.description, sbi.bot_user_id, sbi.created_at, u.username
       FROM server_bot_installs sbi
       INNER JOIN bot_applications ba ON ba.id = sbi.application_id
       INNER JOIN users u ON u.id = sbi.bot_user_id
       WHERE sbi.server_id = ?`,
    )
      .bind(server.id)
      .all<{
        id: string;
        name: string;
        description: string;
        bot_user_id: string;
        created_at: string;
        username: string;
      }>();

    return c.json({
      bots: (rows.results ?? []).map((r) => ({
        applicationId: r.id,
        name: r.name,
        description: r.description,
        botUserId: r.bot_user_id,
        username: r.username,
        installedAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/bots/:appId/install", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_server"));
    if (!canManage) {
      return jsonError("You do not have permission to install bots.", 403);
    }

    const app = await c.env.DB.prepare(
      "SELECT id, name FROM bot_applications WHERE id = ? LIMIT 1",
    )
      .bind(c.req.param("appId"))
      .first<{ id: string; name: string }>();

    if (!app) {
      return jsonError("Application not found.", 404);
    }

    const existing = await c.env.DB.prepare(
      "SELECT bot_user_id FROM server_bot_installs WHERE server_id = ? AND application_id = ? LIMIT 1",
    )
      .bind(server.id, app.id)
      .first<{ bot_user_id: string }>();

    if (existing) {
      return c.json({ ok: true, botUserId: existing.bot_user_id });
    }

    let botUserId = await c.env.DB.prepare(
      "SELECT id FROM users WHERE username LIKE ? AND is_bot = 1 LIMIT 1",
    )
      .bind(`bot-${app.id.slice(0, 8)}%`)
      .first<{ id: string }>()
      .then((r) => r?.id ?? null);

    if (!botUserId) {
      botUserId = newId();
      const username = `bot-${app.id.slice(0, 8)}`;
      await c.env.DB.prepare(
        `INSERT INTO users (id, username, email, password_hash, password_salt, display_name, is_bot, email_verified)
         VALUES (?, ?, '', '', '', ?, 1, 1)`,
      )
        .bind(botUserId, username, app.name)
        .run();
    }

    await c.env.DB.prepare(
      `INSERT INTO server_bot_installs (server_id, application_id, bot_user_id, installed_by)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(server.id, app.id, botUserId, user.sub)
      .run();

    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)",
    )
      .bind(newId(), server.id, botUserId)
      .run();

    return c.json({ ok: true, botUserId });
  });

  app.delete("/api/servers/:serverId/bots/:appId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_server"));
    if (!canManage) {
      return jsonError("You do not have permission to remove bots.", 403);
    }

    const install = await c.env.DB.prepare(
      "SELECT bot_user_id FROM server_bot_installs WHERE server_id = ? AND application_id = ? LIMIT 1",
    )
      .bind(server.id, c.req.param("appId"))
      .first<{ bot_user_id: string }>();

    if (install) {
      await c.env.DB.batch([
        c.env.DB
          .prepare("DELETE FROM server_bot_installs WHERE server_id = ? AND application_id = ?")
          .bind(server.id, c.req.param("appId")),
        c.env.DB
          .prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
          .bind(server.id, install.bot_user_id),
      ]);
    }

    return c.json({ ok: true });
  });

  app.get("/api/bot/me", async (c) => {
    const bot = await requireBot(c.env.DB, c.req.header("Authorization"));
    if (bot instanceof Response) return bot;

    const app = await c.env.DB.prepare(
      "SELECT id, name, description FROM bot_applications WHERE id = ? LIMIT 1",
    )
      .bind(bot.applicationId)
      .first<{ id: string; name: string; description: string }>();

    const profile = await c.env.DB.prepare(
      "SELECT id, username, display_name FROM users WHERE id = ? LIMIT 1",
    )
      .bind(bot.botUserId)
      .first<{ id: string; username: string; display_name: string }>();

    return c.json({
      application: app,
      bot: profile
        ? { id: profile.id, username: profile.username, displayName: profile.display_name }
        : null,
    });
  });

  app.post("/api/bot/servers/:serverId/channels/:channelId/messages", async (c) => {
    const bot = await requireBotForServer(
      c.env.DB,
      c.req.header("Authorization"),
      c.req.param("serverId"),
    );
    if (bot instanceof Response) return bot;

    const channel = await getServerChannel(c.env.DB, c.req.param("serverId"), c.req.param("channelId"));
    if (!channel) {
      return jsonError("Channel not found.", 404);
    }

    if (channel.type !== "text") {
      return jsonError("Bots can only post in text channels.", 400);
    }

    const body = (await c.req.json()) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content || content.length > 2000) {
      return jsonError("Content must be 1-2000 characters.", 400);
    }

    const messageId = newId();
    await c.env.DB.prepare(
      `INSERT INTO messages (id, channel_id, server_id, author_id, content, thread_root_id, reply_to_id)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    )
      .bind(messageId, channel.id, c.req.param("serverId"), bot.botUserId, content)
      .run();

    const message = await getMessageById(
      c.env.DB,
      channel.id,
      messageId,
      bot.botUserId,
      c.req.param("serverId"),
    );
    if (message) {
      await broadcastTextEvent(c.env, channel.id, { type: "message-create", message });
    }

    return c.json({ message });
  });
}
