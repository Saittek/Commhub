export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export async function getUserPresence(
  db: D1Database,
  userId: string,
): Promise<{ status: PresenceStatus; customStatus: string | null; activityType: string | null; activityName: string | null }> {
  try {
    const row = await db
      .prepare(
        "SELECT status, custom_status, activity_type, activity_name FROM user_presence WHERE user_id = ? LIMIT 1",
      )
      .bind(userId)
      .first<{
        status: PresenceStatus;
        custom_status: string | null;
        activity_type: string | null;
        activity_name: string | null;
      }>();

    return {
      status: row?.status ?? "online",
      customStatus: row?.custom_status ?? null,
      activityType: row?.activity_type ?? null,
      activityName: row?.activity_name ?? null,
    };
  } catch {
    return { status: "online", customStatus: null, activityType: null, activityName: null };
  }
}

export async function setUserPresence(
  db: D1Database,
  userId: string,
  status: PresenceStatus,
  customStatus?: string | null,
  activity?: { type?: string | null; name?: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_presence (user_id, status, custom_status, activity_type, activity_name, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         status = excluded.status,
         custom_status = excluded.custom_status,
         activity_type = excluded.activity_type,
         activity_name = excluded.activity_name,
         updated_at = datetime('now')`,
    )
    .bind(
      userId,
      status,
      customStatus ?? null,
      activity?.type ?? null,
      activity?.name ?? null,
    )
    .run();
}

export async function isMemberTimedOut(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        `SELECT expires_at FROM member_timeouts
         WHERE server_id = ? AND user_id = ?
           AND datetime(expires_at) > datetime('now')
         LIMIT 1`,
      )
      .bind(serverId, userId)
      .first<{ expires_at: string }>();

    return Boolean(row);
  } catch {
    return false;
  }
}

export async function getMemberTimeout(
  db: D1Database,
  serverId: string,
  userId: string,
): Promise<{ expiresAt: string; reason: string } | null> {
  try {
    const row = await db
      .prepare(
        `SELECT expires_at, reason FROM member_timeouts
         WHERE server_id = ? AND user_id = ?
           AND datetime(expires_at) > datetime('now')
         LIMIT 1`,
      )
      .bind(serverId, userId)
      .first<{ expires_at: string; reason: string }>();

    if (!row) {
      return null;
    }

    return { expiresAt: row.expires_at, reason: row.reason };
  } catch {
    return null;
  }
}

export async function checkAutomod(
  db: D1Database,
  serverId: string,
  content: string,
): Promise<string | null> {
  try {
    const rules = await db
      .prepare(
        "SELECT trigger_type, action, config FROM automod_rules WHERE server_id = ? AND enabled = 1",
      )
      .bind(serverId)
      .all<{ trigger_type: string; action: string; config: string }>();

    const lower = content.toLowerCase();

    for (const rule of rules.results ?? []) {
      let triggered = false;

      if (rule.trigger_type === "keyword") {
        let keywords: string[] = [];
        try {
          keywords = JSON.parse(rule.config).keywords ?? [];
        } catch {
          keywords = [];
        }
        triggered = keywords.some((word: string) => lower.includes(String(word).toLowerCase()));
      } else if (rule.trigger_type === "mention_spam") {
        const mentions = (content.match(/<@[^>]+>/g) ?? []).length;
        const limit = JSON.parse(rule.config || "{}").maxMentions ?? 5;
        triggered = mentions > limit;
      } else if (rule.trigger_type === "link") {
        triggered = /https?:\/\//i.test(content);
      } else if (rule.trigger_type === "spam") {
        const repeat = /(.)\1{8,}/.test(content);
        triggered = repeat;
      }

      if (triggered && rule.action === "block") {
        return "Your message was blocked by an automod rule.";
      }
    }
  } catch {
    // Automod tables may not exist yet.
  }

  return null;
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function getDisplayNameInServer(
  db: D1Database,
  serverId: string,
  userId: string,
  fallbackDisplayName: string,
): Promise<string> {
  try {
    const row = await db
      .prepare(
        `SELECT sm.nickname, u.display_name
         FROM server_members sm
         INNER JOIN users u ON u.id = sm.user_id
         WHERE sm.server_id = ? AND sm.user_id = ? LIMIT 1`,
      )
      .bind(serverId, userId)
      .first<{ nickname: string | null; display_name: string }>();

    if (!row) {
      return fallbackDisplayName;
    }

    return row.nickname?.trim() || row.display_name;
  } catch {
    return fallbackDisplayName;
  }
}
