export interface DmAttachmentRow {
  id: string;
  message_id: string | null;
  filename: string;
  content_type: string;
  size: number;
  storage_key: string;
}

export interface DmAttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export async function createPendingDmAttachment(
  db: D1Database,
  input: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dm_attachments (id, message_id, filename, content_type, size, storage_key)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.filename, input.contentType, input.size, input.storageKey)
    .run();
}

export async function linkDmAttachmentsToMessage(
  db: D1Database,
  messageId: string,
  attachmentIds: string[],
  authorId: string,
): Promise<void> {
  if (attachmentIds.length === 0) {
    return;
  }

  const placeholders = attachmentIds.map(() => "?").join(", ");
  await db
    .prepare(
      `UPDATE dm_attachments
       SET message_id = ?
       WHERE id IN (${placeholders})
         AND message_id IS NULL
         AND storage_key LIKE ?`,
    )
    .bind(messageId, ...attachmentIds, `${authorId}/%`)
    .run();
}

export async function getDmAttachment(
  db: D1Database,
  attachmentId: string,
): Promise<DmAttachmentRow | null> {
  return db
    .prepare(
      "SELECT id, message_id, filename, content_type, size, storage_key FROM dm_attachments WHERE id = ? LIMIT 1",
    )
    .bind(attachmentId)
    .first<DmAttachmentRow>();
}

export async function loadDmAttachmentsByMessageIds(
  db: D1Database,
  messageIds: string[],
): Promise<Map<string, DmAttachmentDto[]>> {
  const map = new Map<string, DmAttachmentDto[]>();
  if (messageIds.length === 0) {
    return map;
  }

  const placeholders = messageIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT id, message_id, filename, content_type, size
       FROM dm_attachments WHERE message_id IN (${placeholders})`,
    )
    .bind(...messageIds)
    .all<{
      id: string;
      message_id: string;
      filename: string;
      content_type: string;
      size: number;
    }>();

  for (const row of rows.results ?? []) {
    const list = map.get(row.message_id) ?? [];
    list.push({
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      size: row.size,
      url: `/api/dms/attachments/${row.id}`,
    });
    map.set(row.message_id, list);
  }

  return map;
}
