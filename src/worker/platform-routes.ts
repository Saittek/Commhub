import type { Hono } from "hono";
import { requireUser } from "./lib/session";
import { requireServerMember } from "./lib/server-access";
import { memberHasPermission } from "./lib/user-permissions";
import { getServerBoostPerks } from "./lib/boost-limits";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}

function computeBoostLevel(count: number): number {
  if (count >= 14) return 3;
  if (count >= 7) return 2;
  if (count >= 2) return 1;
  return 0;
}

const SOUND_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/webm"]);
const MAX_SOUND_BYTES = 512 * 1024;

export function registerPlatformRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/push/subscribe", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return jsonError("Invalid push subscription.", 400);
    }

    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(newId(), user.sub, body.endpoint, body.keys.p256dh, body.keys.auth)
      .run();

    return c.json({ ok: true });
  });

  app.delete("/api/push/subscribe", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
    if (body.endpoint) {
      await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
        .bind(user.sub, body.endpoint)
        .run();
    } else {
      await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(user.sub).run();
    }

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/sounds", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      "SELECT id, name, created_at FROM server_sounds WHERE server_id = ? ORDER BY name ASC",
    )
      .bind(server.id)
      .all<{ id: string; name: string; created_at: string }>();

    return c.json({
      sounds: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        url: `/api/servers/${server.id}/sounds/${r.id}`,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/servers/:serverId/sounds", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_server"));
    if (!canManage) {
      return jsonError("You do not have permission to manage sounds.", 403);
    }

    if (!c.env.ATTACHMENTS) {
      return jsonError("Storage unavailable.", 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

    if (!(file instanceof File) || !name) {
      return jsonError("file and name are required.", 400);
    }
    if (!SOUND_TYPES.has(file.type) || file.size > MAX_SOUND_BYTES) {
      return jsonError("Sound must be audio under 512KB.", 400);
    }

    const perks = await getServerBoostPerks(c.env.DB, server.id);
    const soundCount = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM server_sounds WHERE server_id = ?",
    )
      .bind(server.id)
      .first<{ count: number }>();
    if ((soundCount?.count ?? 0) >= perks.soundboardSlots) {
      return jsonError(`Soundboard is full (${perks.soundboardSlots} slots at boost level ${perks.boostLevel}).`, 400);
    }

    const soundId = newId();
    const ext = file.type.includes("ogg") ? "ogg" : file.type.includes("wav") ? "wav" : "mp3";
    const storageKey = `sounds/${server.id}/${soundId}.${ext}`;

    await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    await c.env.DB.prepare(
      "INSERT INTO server_sounds (id, server_id, name, storage_key, created_by) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(soundId, server.id, name, storageKey, user.sub)
      .run();

    return c.json({ sound: { id: soundId, name, url: `/api/servers/${server.id}/sounds/${soundId}` } });
  });

  app.get("/api/servers/:serverId/sounds/:soundId", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT storage_key FROM server_sounds WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("soundId"), c.req.param("serverId"))
      .first<{ storage_key: string }>();

    if (!row || !c.env.ATTACHMENTS) {
      return jsonError("Sound not found.", 404);
    }

    const object = await c.env.ATTACHMENTS.get(row.storage_key);
    if (!object) {
      return jsonError("Sound not found.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(object.body, { headers });
  });

  app.delete("/api/servers/:serverId/sounds/:soundId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const canManage =
      server.owner_id === user.sub ||
      (await memberHasPermission(c.env.DB, server.id, user.sub, server.owner_id, "manage_server"));
    if (!canManage) {
      return jsonError("You do not have permission to delete sounds.", 403);
    }

    const row = await c.env.DB.prepare(
      "SELECT storage_key FROM server_sounds WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("soundId"), server.id)
      .first<{ storage_key: string }>();

    if (row && c.env.ATTACHMENTS) {
      await c.env.ATTACHMENTS.delete(row.storage_key);
    }

    await c.env.DB.prepare("DELETE FROM server_sounds WHERE id = ? AND server_id = ?")
      .bind(c.req.param("soundId"), server.id)
      .run();

    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/boosts", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const serverRow = await c.env.DB.prepare(
      "SELECT boost_count, boost_level FROM servers WHERE id = ? LIMIT 1",
    )
      .bind(server.id)
      .first<{ boost_count: number; boost_level: number }>();

    const myBoost = await c.env.DB.prepare(
      "SELECT id FROM server_boosts WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(server.id, user.sub)
      .first<{ id: string }>();

    return c.json({
      boostCount: serverRow?.boost_count ?? 0,
      boostLevel: serverRow?.boost_level ?? 0,
      meBoosted: Boolean(myBoost),
      perks: {
        uploadLimitMb: (serverRow?.boost_level ?? 0) >= 2 ? 50 : 25,
        emojiSlots: 50 + (serverRow?.boost_level ?? 0) * 25,
        soundboardSlots: 8 + (serverRow?.boost_level ?? 0) * 4,
      },
    });
  });

  app.post("/api/servers/:serverId/boosts", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const existing = await c.env.DB.prepare(
      "SELECT id FROM server_boosts WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(server.id, user.sub)
      .first();

    if (existing) {
      return jsonError("You already boosted this server.", 400);
    }

    await c.env.DB.prepare(
      "INSERT INTO server_boosts (id, server_id, user_id) VALUES (?, ?, ?)",
    )
      .bind(newId(), server.id, user.sub)
      .run();

    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM server_boosts WHERE server_id = ?",
    )
      .bind(server.id)
      .first<{ count: number }>();

    const boostCount = countRow?.count ?? 1;
    const boostLevel = computeBoostLevel(boostCount);

    await c.env.DB.prepare("UPDATE servers SET boost_count = ?, boost_level = ? WHERE id = ?")
      .bind(boostCount, boostLevel, server.id)
      .run();

    return c.json({ ok: true, boostCount, boostLevel });
  });

  app.delete("/api/servers/:serverId/boosts", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    await c.env.DB.prepare("DELETE FROM server_boosts WHERE server_id = ? AND user_id = ?")
      .bind(server.id, user.sub)
      .run();

    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM server_boosts WHERE server_id = ?",
    )
      .bind(server.id)
      .first<{ count: number }>();

    const boostCount = countRow?.count ?? 0;
    const boostLevel = computeBoostLevel(boostCount);

    await c.env.DB.prepare("UPDATE servers SET boost_count = ?, boost_level = ? WHERE id = ?")
      .bind(boostCount, boostLevel, server.id)
      .run();

    return c.json({ ok: true, boostCount, boostLevel });
  });

  app.get("/api/servers/:serverId/activities", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      `SELECT a.id, a.channel_id, a.activity_type, a.activity_name, a.started_at, a.metadata,
              u.username, u.display_name
       FROM activity_sessions a
       INNER JOIN users u ON u.id = a.host_user_id
       WHERE a.server_id = ?
       ORDER BY a.started_at DESC LIMIT 10`,
    )
      .bind(server.id)
      .all<{
        id: string;
        channel_id: string | null;
        activity_type: string;
        activity_name: string;
        started_at: string;
        metadata: string;
        username: string;
        display_name: string;
      }>();

    return c.json({
      activities: (rows.results ?? []).map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        type: r.activity_type,
        name: r.activity_name,
        startedAt: r.started_at,
        metadata: r.metadata ?? "{}",
        host: { username: r.username, displayName: r.display_name },
      })),
    });
  });

  app.post("/api/servers/:serverId/activities", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const body = (await c.req.json()) as {
      channelId?: string | null;
      type?: string;
      name?: string;
    };

    const activityId = newId();
    await c.env.DB.prepare(
      `INSERT INTO activity_sessions (id, server_id, channel_id, host_user_id, activity_type, activity_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        activityId,
        server.id,
        body.channelId ?? null,
        user.sub,
        body.type ?? "watch",
        body.name?.trim() ?? "Watch Together",
      )
      .run();

    return c.json({ activity: { id: activityId } }, 201);
  });

  app.delete("/api/servers/:serverId/activities/:activityId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const session = await c.env.DB.prepare(
      "SELECT host_user_id FROM activity_sessions WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("activityId"), c.req.param("serverId"))
      .first<{ host_user_id: string }>();

    if (!session) {
      return jsonError("Activity not found.", 404);
    }

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    if (session.host_user_id !== user.sub && server.owner_id !== user.sub) {
      return jsonError("Only the host can end this activity.", 403);
    }

    await c.env.DB.prepare("DELETE FROM activity_sessions WHERE id = ?").bind(c.req.param("activityId")).run();
    return c.json({ ok: true });
  });

  app.patch("/api/servers/:serverId/activities/:activityId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const session = await c.env.DB.prepare(
      "SELECT host_user_id FROM activity_sessions WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("activityId"), c.req.param("serverId"))
      .first<{ host_user_id: string }>();

    if (!session) {
      return jsonError("Activity not found.", 404);
    }

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    if (session.host_user_id !== user.sub && server.owner_id !== user.sub) {
      return jsonError("Only the host can update this activity.", 403);
    }

    const body = (await c.req.json()) as { metadata?: Record<string, unknown> };
    if (!body.metadata || typeof body.metadata !== "object") {
      return jsonError("metadata object is required.", 400);
    }

    await c.env.DB.prepare("UPDATE activity_sessions SET metadata = ? WHERE id = ?")
      .bind(JSON.stringify(body.metadata), c.req.param("activityId"))
      .run();

    return c.json({ ok: true });
  });
}
