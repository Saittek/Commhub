export type AuditActionType =
  | "member_kick"
  | "member_ban"
  | "member_timeout"
  | "member_unban"
  | "settings_update"
  | "role_create"
  | "role_update"
  | "role_delete"
  | "channel_create"
  | "channel_update"
  | "channel_delete"
  | "message_delete"
  | "invite_regenerate";

export async function writeAuditLog(
  db: D1Database,
  input: {
    serverId: string;
    actorUserId: string | null;
    actionType: AuditActionType;
    targetType?: string | null;
    targetId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log_events
        (id, server_id, actor_user_id, action_type, target_type, target_id, reason, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.serverId,
      input.actorUserId,
      input.actionType,
      input.targetType ?? null,
      input.targetId ?? null,
      input.reason ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    )
    .run();
}

export interface AuditLogRow {
  id: string;
  server_id: string;
  actor_user_id: string | null;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  metadata: string | null;
  created_at: string;
  actor_username: string | null;
}

export async function listAuditLog(
  db: D1Database,
  serverId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  const result = await db
    .prepare(
      `SELECT e.id, e.server_id, e.actor_user_id, e.action_type, e.target_type, e.target_id,
              e.reason, e.metadata, e.created_at, u.username AS actor_username
       FROM audit_log_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.server_id = ?
       ORDER BY e.created_at DESC
       LIMIT ?`,
    )
    .bind(serverId, limit)
    .all<AuditLogRow>();

  return result.results ?? [];
}
