import type { Context, Hono } from "hono";
import { getServerChannel, isVoiceLikeType } from "./lib/channels";
import {
  addCallsTracks,
  callsConfigured,
  closeCallsTracks,
  createCallsSession,
  renegotiateCallsSession,
  type CallsSessionDescription,
  type CallsTrackDescriptor,
} from "./lib/calls-api";
import { requireServerMember } from "./lib/server-access";
import { requireUser } from "./lib/session";
import { memberHasPermission } from "./lib/user-permissions";
import { checkVerificationLevel } from "./lib/verification";
import { isMemberTimedOut } from "./lib/discord-features";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function requireVoiceChannel(
  c: Context<{ Bindings: Env }>,
  user: Awaited<ReturnType<typeof requireUser>>,
  serverId: string,
  channelId: string,
) {
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, serverId);
  if (server instanceof Response) {
    return server;
  }

  const channel = await getServerChannel(c.env.DB, server.id, channelId);
  if (!channel || !isVoiceLikeType(channel.type)) {
    return jsonError("Voice channel not found.", 404);
  }

  const verificationError = await checkVerificationLevel(c.env.DB, server, user.sub);
  if (verificationError) {
    return jsonError(verificationError, 403);
  }

  const canConnect = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "connect_voice",
  );
  if (!canConnect) {
    return jsonError("You do not have permission to join voice channels.", 403);
  }

  if (await isMemberTimedOut(c.env.DB, server.id, user.sub)) {
    return jsonError("You are timed out and cannot join voice channels.", 403);
  }

  return { server, channel };
}

export function registerCallsRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/servers/:serverId/channels/:channelId/voice/calls/config", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const enabled = callsConfigured(c.env);
    return c.json({
      enabled,
      iceServers: enabled
        ? [{ urls: "stun:stun.cloudflare.com:3478" }]
        : [{ urls: "stun:stun.l.google.com:19302" }],
    });
  });

  app.post("/api/servers/:serverId/channels/:channelId/voice/calls/session", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    if (!callsConfigured(c.env)) {
      return jsonError("Cloudflare Calls is not configured on this server.", 503);
    }

    const gate = await requireVoiceChannel(c, user, c.req.param("serverId"), c.req.param("channelId"));
    if (gate instanceof Response) {
      return gate;
    }

    const session = await createCallsSession(c.env);
    return c.json(session);
  });

  app.post("/api/servers/:serverId/channels/:channelId/voice/calls/tracks", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    if (!callsConfigured(c.env)) {
      return jsonError("Cloudflare Calls is not configured on this server.", 503);
    }

    const gate = await requireVoiceChannel(c, user, c.req.param("serverId"), c.req.param("channelId"));
    if (gate instanceof Response) {
      return gate;
    }

    const body = (await c.req.json()) as {
      sessionId?: string;
      sessionDescription?: CallsSessionDescription;
      tracks?: CallsTrackDescriptor[];
    };

    if (!body.sessionId || !body.tracks?.length) {
      return jsonError("sessionId and tracks are required.", 400);
    }

    const result = await addCallsTracks(c.env, body.sessionId, {
      sessionDescription: body.sessionDescription,
      tracks: body.tracks,
    });

    return c.json(result);
  });

  app.put("/api/servers/:serverId/channels/:channelId/voice/calls/renegotiate", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    if (!callsConfigured(c.env)) {
      return jsonError("Cloudflare Calls is not configured on this server.", 503);
    }

    const gate = await requireVoiceChannel(c, user, c.req.param("serverId"), c.req.param("channelId"));
    if (gate instanceof Response) {
      return gate;
    }

    const body = (await c.req.json()) as {
      sessionId?: string;
      sessionDescription?: CallsSessionDescription;
    };

    if (!body.sessionId || !body.sessionDescription) {
      return jsonError("sessionId and sessionDescription are required.", 400);
    }

    await renegotiateCallsSession(c.env, body.sessionId, body.sessionDescription);
    return c.json({ ok: true });
  });

  app.put("/api/servers/:serverId/channels/:channelId/voice/calls/tracks/close", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    if (!callsConfigured(c.env)) {
      return jsonError("Cloudflare Calls is not configured on this server.", 503);
    }

    const gate = await requireVoiceChannel(c, user, c.req.param("serverId"), c.req.param("channelId"));
    if (gate instanceof Response) {
      return gate;
    }

    const body = (await c.req.json()) as { sessionId?: string; trackNames?: string[] };
    if (!body.sessionId) {
      return jsonError("sessionId is required.", 400);
    }

    await closeCallsTracks(c.env, body.sessionId, body.trackNames ?? []);
    return c.json({ ok: true });
  });
}
