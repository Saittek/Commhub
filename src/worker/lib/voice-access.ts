import type { Context } from "hono";
import { getServerChannel, isVoiceLikeType } from "./channels";
import { isMemberTimedOut } from "./discord-features";
import { hasPermission } from "./permissions";
import { requireServerMember } from "./server-access";
import { requireUser } from "./session";
import { getMemberPermissions } from "./user-permissions";
import { checkVerificationLevel } from "./verification";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function requireVoiceChannelAccess(
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

  const permissions = await getMemberPermissions(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
  );

  if (!hasPermission(permissions, "connect_voice")) {
    return jsonError("You do not have permission to join voice channels.", 403);
  }

  if (await isMemberTimedOut(c.env.DB, server.id, user.sub)) {
    return jsonError("You are timed out and cannot join voice channels.", 403);
  }

  return {
    server,
    channel,
    canSpeak: hasPermission(permissions, "speak_voice"),
  };
}
