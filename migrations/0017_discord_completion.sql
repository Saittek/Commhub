CREATE TABLE dm_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
);

ALTER TABLE dm_channels ADD COLUMN name TEXT;
ALTER TABLE dm_channels ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0;

CREATE TABLE message_embeds (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_message_embeds_message ON message_embeds(message_id);

ALTER TABLE messages ADD COLUMN thread_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN thread_locked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE servers ADD COLUMN afk_channel_id TEXT;
