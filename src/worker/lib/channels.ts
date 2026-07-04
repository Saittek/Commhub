const CHANNEL_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/;
const VOICE_BITRATES = [32000, 64000, 96000] as const;

export type ChannelType = "text" | "voice";

export interface CreateChannelInput {
  name: string;
  type: ChannelType;
}

export interface UpdateChannelInput {
  name?: string;
  voiceBitrate?: number;
  voiceUserLimit?: number;
  voicePttOnly?: boolean;
}

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  type: string;
  created_at: string;
  voice_bitrate: number;
  voice_user_limit: number;
  voice_ptt_only: number;
}

export const CHANNEL_SELECT =
  "id, server_id, name, type, created_at, voice_bitrate, voice_user_limit, voice_ptt_only";

export const CHANNEL_SELECT_LEGACY = "id, server_id, name, type, created_at";

export function withDefaultVoiceFields(
  row: Omit<ChannelRow, "voice_bitrate" | "voice_user_limit" | "voice_ptt_only"> & {
    voice_bitrate?: number;
    voice_user_limit?: number;
    voice_ptt_only?: number;
  },
): ChannelRow {
  return {
    ...row,
    voice_bitrate: row.voice_bitrate ?? 64000,
    voice_user_limit: row.voice_user_limit ?? 0,
    voice_ptt_only: row.voice_ptt_only ?? 0,
  };
}

export async function listServerChannels(db: D1Database, serverId: string): Promise<ChannelRow[]> {
  try {
    const result = await db
      .prepare(
        `SELECT ${CHANNEL_SELECT}
         FROM channels WHERE server_id = ?
         ORDER BY type ASC, created_at ASC`,
      )
      .bind(serverId)
      .all<ChannelRow>();
    return result.results ?? [];
  } catch {
    const result = await db
      .prepare(
        `SELECT ${CHANNEL_SELECT_LEGACY}
         FROM channels WHERE server_id = ?
         ORDER BY type ASC, created_at ASC`,
      )
      .bind(serverId)
      .all<Omit<ChannelRow, "voice_bitrate" | "voice_user_limit" | "voice_ptt_only">>();
    return (result.results ?? []).map(withDefaultVoiceFields);
  }
}

export async function getServerChannel(
  db: D1Database,
  serverId: string,
  channelId: string,
): Promise<ChannelRow | null> {
  try {
    return await db
      .prepare(`SELECT ${CHANNEL_SELECT} FROM channels WHERE id = ? AND server_id = ? LIMIT 1`)
      .bind(channelId, serverId)
      .first<ChannelRow>();
  } catch {
    const row = await db
      .prepare(
        `SELECT ${CHANNEL_SELECT_LEGACY} FROM channels WHERE id = ? AND server_id = ? LIMIT 1`,
      )
      .bind(channelId, serverId)
      .first<Omit<ChannelRow, "voice_bitrate" | "voice_user_limit" | "voice_ptt_only">>();

    return row ? withDefaultVoiceFields(row) : null;
  }
}

export function normalizeChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

export function validateCreateChannel(input: CreateChannelInput): string | null {
  const name = normalizeChannelName(input.name);

  if (!CHANNEL_NAME_PATTERN.test(name)) {
    return "Channel name must be 2-32 characters using letters, numbers, hyphens, or underscores.";
  }

  if (input.type !== "text" && input.type !== "voice") {
    return "Channel type must be text or voice.";
  }

  return null;
}

export function validateUpdateChannel(input: UpdateChannelInput): string | null {
  if (input.name !== undefined) {
    const name = normalizeChannelName(input.name);
    if (!CHANNEL_NAME_PATTERN.test(name)) {
      return "Channel name must be 2-32 characters using letters, numbers, hyphens, or underscores.";
    }
  }

  if (
    input.voiceBitrate !== undefined &&
    !VOICE_BITRATES.includes(input.voiceBitrate as (typeof VOICE_BITRATES)[number])
  ) {
    return "Voice bitrate must be 32, 64, or 96 kbps.";
  }

  if (
    input.voiceUserLimit !== undefined &&
    (!Number.isInteger(input.voiceUserLimit) || input.voiceUserLimit < 0 || input.voiceUserLimit > 99)
  ) {
    return "Voice user limit must be between 0 (unlimited) and 99.";
  }

  return null;
}

export function mapChannel(row: ChannelRow) {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    type: row.type as ChannelType,
    createdAt: row.created_at,
    voiceBitrate: row.voice_bitrate,
    voiceUserLimit: row.voice_user_limit,
    voicePttOnly: row.voice_ptt_only === 1,
  };
}
