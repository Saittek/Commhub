const CHANNEL_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/;
const VOICE_BITRATES = [32000, 64000, 96000] as const;

/** Hard cap for mesh voice; 0 in settings means use this platform maximum. */
export const MAX_VOICE_CHANNEL_USERS = 25;

export function resolveVoiceUserLimit(channelLimit: number): number {
  if (!Number.isInteger(channelLimit) || channelLimit < 0) {
    return MAX_VOICE_CHANNEL_USERS;
  }
  if (channelLimit === 0) {
    return MAX_VOICE_CHANNEL_USERS;
  }
  return Math.min(channelLimit, MAX_VOICE_CHANNEL_USERS);
}

export type ChannelType = "text" | "voice" | "forum" | "announcement" | "stage";

const CHANNEL_TYPES = new Set<ChannelType>([
  "text",
  "voice",
  "forum",
  "announcement",
  "stage",
]);

export function isVoiceLikeType(type: string): boolean {
  return type === "voice" || type === "stage";
}

export function isMessageChannelType(type: string): boolean {
  return type === "text" || type === "announcement";
}

export interface CreateChannelInput {
  name: string;
  type: ChannelType;
}

export interface UpdateChannelInput {
  name?: string;
  voiceBitrate?: number;
  voiceUserLimit?: number;
  voicePttOnly?: boolean;
  topic?: string;
  slowModeSeconds?: number;
  nsfw?: boolean;
  categoryId?: string | null;
  position?: number;
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
  topic?: string | null;
  slow_mode_seconds?: number;
  nsfw?: number;
  category_id?: string | null;
  position?: number;
}

export const CHANNEL_SELECT =
  "id, server_id, name, type, created_at, voice_bitrate, voice_user_limit, voice_ptt_only, topic, slow_mode_seconds, nsfw, category_id, position";

export const CHANNEL_SELECT_MODERN =
  "id, server_id, name, type, created_at, voice_bitrate, voice_user_limit, voice_ptt_only, topic, slow_mode_seconds, nsfw";

export const CHANNEL_SELECT_LEGACY = "id, server_id, name, type, created_at";

export function withDefaultVoiceFields(
  row: Omit<ChannelRow, "voice_bitrate" | "voice_user_limit" | "voice_ptt_only"> & {
    voice_bitrate?: number;
    voice_user_limit?: number;
    voice_ptt_only?: number;
    topic?: string | null;
    slow_mode_seconds?: number;
    nsfw?: number;
  },
): ChannelRow {
  return {
    ...row,
    voice_bitrate: row.voice_bitrate ?? 64000,
    voice_user_limit: row.voice_user_limit ?? 0,
    voice_ptt_only: row.voice_ptt_only ?? 0,
    topic: row.topic ?? null,
    slow_mode_seconds: row.slow_mode_seconds ?? 0,
    nsfw: row.nsfw ?? 0,
    category_id: row.category_id ?? null,
    position: row.position ?? 0,
  };
}

export async function listServerChannels(db: D1Database, serverId: string): Promise<ChannelRow[]> {
  try {
    const result = await db
      .prepare(
        `SELECT ${CHANNEL_SELECT}
         FROM channels WHERE server_id = ?
         ORDER BY position ASC, type ASC, created_at ASC`,
      )
      .bind(serverId)
      .all<ChannelRow>();
    return (result.results ?? []).filter((row) => CHANNEL_TYPES.has(row.type as ChannelType));
  } catch {
    try {
      const result = await db
        .prepare(
          `SELECT ${CHANNEL_SELECT_MODERN}
           FROM channels WHERE server_id = ?
           ORDER BY type ASC, created_at ASC`,
        )
        .bind(serverId)
        .all<Omit<ChannelRow, "category_id" | "position">>();
      return (result.results ?? [])
        .map((row) => withDefaultVoiceFields({ ...row, category_id: null, position: 0 }))
        .filter((row) => CHANNEL_TYPES.has(row.type as ChannelType));
    } catch {
      const result = await db
        .prepare(
          `SELECT ${CHANNEL_SELECT_LEGACY}
           FROM channels WHERE server_id = ?
           ORDER BY type ASC, created_at ASC`,
        )
        .bind(serverId)
        .all<Omit<ChannelRow, "voice_bitrate" | "voice_user_limit" | "voice_ptt_only">>();
      return (result.results ?? [])
        .map(withDefaultVoiceFields)
        .filter((row) => CHANNEL_TYPES.has(row.type as ChannelType));
    }
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

  if (!CHANNEL_TYPES.has(input.type)) {
    return "Channel type must be text, voice, forum, announcement, or stage.";
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
    (!Number.isInteger(input.voiceUserLimit) || input.voiceUserLimit < 0 || input.voiceUserLimit > MAX_VOICE_CHANNEL_USERS)
  ) {
    return `Voice user limit must be between 0 (platform max, ${MAX_VOICE_CHANNEL_USERS}) and ${MAX_VOICE_CHANNEL_USERS}.`;
  }

  if (
    input.slowModeSeconds !== undefined &&
    (!Number.isInteger(input.slowModeSeconds) || input.slowModeSeconds < 0 || input.slowModeSeconds > 21600)
  ) {
    return "Slow mode must be between 0 and 21600 seconds.";
  }

  if (input.topic !== undefined && input.topic.length > 1024) {
    return "Channel topic must be 1024 characters or fewer.";
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
    topic: row.topic ?? null,
    slowModeSeconds: row.slow_mode_seconds ?? 0,
    nsfw: (row.nsfw ?? 0) === 1,
    categoryId: row.category_id ?? null,
    position: row.position ?? 0,
  };
}
