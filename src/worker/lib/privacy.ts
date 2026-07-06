export type DmPrivacyLevel = 0 | 1 | 2;

export interface PrivacySettings {
  allowDmFrom: DmPrivacyLevel;
  allowFriendRequests: boolean;
  showActivityStatus: boolean;
  allowServerInvites: boolean;
  filterExplicitContent: boolean;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  allowDmFrom: 1,
  allowFriendRequests: true,
  showActivityStatus: true,
  allowServerInvites: true,
  filterExplicitContent: true,
};

interface PrivacyRow {
  allow_dm_from: number;
  allow_friend_requests: number;
  show_activity_status: number;
  allow_server_invites: number;
  filter_explicit_content: number;
}

export function mapPrivacyRow(row: PrivacyRow | null): PrivacySettings {
  if (!row) {
    return { ...DEFAULT_PRIVACY };
  }

  return {
    allowDmFrom: row.allow_dm_from as DmPrivacyLevel,
    allowFriendRequests: row.allow_friend_requests === 1,
    showActivityStatus: row.show_activity_status === 1,
    allowServerInvites: row.allow_server_invites === 1,
    filterExplicitContent: row.filter_explicit_content === 1,
  };
}

export async function getPrivacySettings(
  db: D1Database,
  userId: string,
): Promise<PrivacySettings> {
  const row = await db
    .prepare(
      `SELECT allow_dm_from, allow_friend_requests, show_activity_status,
              allow_server_invites, filter_explicit_content
       FROM user_privacy_settings WHERE user_id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<PrivacyRow>();

  return mapPrivacyRow(row);
}

export async function ensurePrivacySettings(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_privacy_settings (user_id)
       VALUES (?)
       ON CONFLICT(user_id) DO NOTHING`,
    )
    .bind(userId)
    .run();
}

export async function updatePrivacySettings(
  db: D1Database,
  userId: string,
  input: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  await ensurePrivacySettings(db, userId);
  const current = await getPrivacySettings(db, userId);
  const next = { ...current, ...input };

  await db
    .prepare(
      `UPDATE user_privacy_settings
       SET allow_dm_from = ?,
           allow_friend_requests = ?,
           show_activity_status = ?,
           allow_server_invites = ?,
           filter_explicit_content = ?
       WHERE user_id = ?`,
    )
    .bind(
      next.allowDmFrom,
      next.allowFriendRequests ? 1 : 0,
      next.showActivityStatus ? 1 : 0,
      next.allowServerInvites ? 1 : 0,
      next.filterExplicitContent ? 1 : 0,
      userId,
    )
    .run();

  return next;
}

export async function shouldShowActivityStatus(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const settings = await getPrivacySettings(db, userId);
  return settings.showActivityStatus;
}

export async function getActivityVisibilityMap(
  db: D1Database,
  userIds: string[],
): Promise<Map<string, boolean>> {
  const visibility = new Map<string, boolean>();
  if (userIds.length === 0) {
    return visibility;
  }

  for (const userId of userIds) {
    visibility.set(userId, true);
  }

  const placeholders = userIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT user_id, show_activity_status
       FROM user_privacy_settings
       WHERE user_id IN (${placeholders})`,
    )
    .bind(...userIds)
    .all<{ user_id: string; show_activity_status: number }>();

  for (const row of rows.results ?? []) {
    visibility.set(row.user_id, row.show_activity_status === 1);
  }

  return visibility;
}
