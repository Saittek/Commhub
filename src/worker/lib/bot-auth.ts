import { hashWebhookToken } from "./webhooks";

export interface BotAuth {
  applicationId: string;
  botUserId: string;
  ownerUserId: string;
}

export async function hashBotToken(token: string): Promise<string> {
  return hashWebhookToken(token);
}

export function generateBotToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `chbot.${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function parseBotAuthorization(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bot\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function requireBot(
  db: D1Database,
  authHeader: string | undefined,
): Promise<BotAuth | Response> {
  const token = parseBotAuthorization(authHeader);
  if (!token) {
    return Response.json({ error: "Bot authorization required." }, { status: 401 });
  }

  const tokenHash = await hashBotToken(token);
  const row = await db
    .prepare(
      `SELECT bt.application_id, ba.owner_user_id, sbi.bot_user_id
       FROM bot_tokens bt
       INNER JOIN bot_applications ba ON ba.id = bt.application_id
       LEFT JOIN server_bot_installs sbi ON sbi.application_id = ba.id
       WHERE bt.token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ application_id: string; owner_user_id: string; bot_user_id: string | null }>();

  if (!row) {
    return Response.json({ error: "Invalid bot token." }, { status: 401 });
  }

  if (!row.bot_user_id) {
    return Response.json({ error: "Bot is not installed on any server." }, { status: 403 });
  }

  return {
    applicationId: row.application_id,
    botUserId: row.bot_user_id,
    ownerUserId: row.owner_user_id,
  };
}

export async function requireBotForServer(
  db: D1Database,
  authHeader: string | undefined,
  serverId: string,
): Promise<BotAuth | Response> {
  const bot = await requireBot(db, authHeader);
  if (bot instanceof Response) return bot;

  const install = await db
    .prepare(
      "SELECT bot_user_id FROM server_bot_installs WHERE server_id = ? AND application_id = ? LIMIT 1",
    )
    .bind(serverId, bot.applicationId)
    .first<{ bot_user_id: string }>();

  if (!install) {
    return Response.json({ error: "Bot is not installed on this server." }, { status: 403 });
  }

  return { ...bot, botUserId: install.bot_user_id };
}
