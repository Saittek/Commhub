const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SERVER_NAME_PATTERN = /^[\w\s-]{2,32}$/;
const VALID_REGIONS = new Set(["us-east", "us-west", "eu", "asia"]);
const VALID_NOTIFICATIONS = new Set(["all", "mentions", "nothing"]);

export interface CreateServerInput {
  name: string;
}

export interface JoinServerInput {
  inviteCode: string;
}

export interface UpdateServerInput {
  name?: string;
  description?: string;
  region?: string;
  invitesPaused?: boolean;
  verificationLevel?: number;
  defaultNotifications?: string;
  explicitContentFilter?: boolean;
  afkTimeoutMinutes?: number;
}

export function validateCreateServer(input: CreateServerInput): string | null {
  const name = input.name.trim();
  if (!SERVER_NAME_PATTERN.test(name)) {
    return "Server name must be 2-32 characters and use letters, numbers, spaces, hyphens, or underscores.";
  }
  return null;
}

export function validateJoinServer(input: JoinServerInput): string | null {
  const inviteCode = input.inviteCode.trim();
  if (inviteCode.length < 4) {
    return "Invite code is required.";
  }
  return null;
}

export function normalizeCreateServer(input: CreateServerInput): CreateServerInput {
  return { name: input.name.trim() };
}

export function normalizeJoinServer(input: JoinServerInput): JoinServerInput {
  return { inviteCode: input.inviteCode.trim().toUpperCase() };
}

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => INVITE_CHARS[byte % INVITE_CHARS.length]).join("");
}

export function validateUpdateServer(input: UpdateServerInput): string | null {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!SERVER_NAME_PATTERN.test(name)) {
      return "Server name must be 2-32 characters and use letters, numbers, spaces, hyphens, or underscores.";
    }
  }

  if (input.description !== undefined && input.description.length > 300) {
    return "Description must be 300 characters or fewer.";
  }

  if (input.region !== undefined && !VALID_REGIONS.has(input.region)) {
    return "Invalid server region.";
  }

  if (
    input.verificationLevel !== undefined &&
    (!Number.isInteger(input.verificationLevel) ||
      input.verificationLevel < 0 ||
      input.verificationLevel > 3)
  ) {
    return "Verification level must be between 0 and 3.";
  }

  if (
    input.defaultNotifications !== undefined &&
    !VALID_NOTIFICATIONS.has(input.defaultNotifications)
  ) {
    return "Invalid default notification setting.";
  }

  if (
    input.afkTimeoutMinutes !== undefined &&
    (!Number.isInteger(input.afkTimeoutMinutes) ||
      input.afkTimeoutMinutes < 1 ||
      input.afkTimeoutMinutes > 60)
  ) {
    return "AFK timeout must be between 1 and 60 minutes.";
  }

  return null;
}

export async function generateUniqueInviteCode(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const inviteCode = generateInviteCode();
    const existing = await db
      .prepare("SELECT id FROM servers WHERE invite_code = ? COLLATE NOCASE LIMIT 1")
      .bind(inviteCode)
      .first<{ id: string }>();

    if (!existing) {
      return inviteCode;
    }
  }

  throw new Error("Could not generate invite code.");
}
