-- Expand channel types (SQLite cannot alter CHECK constraints in place).
PRAGMA foreign_keys=OFF;

CREATE TABLE channels_new (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'voice', 'forum', 'announcement', 'stage')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voice_bitrate INTEGER NOT NULL DEFAULT 64000,
  voice_user_limit INTEGER NOT NULL DEFAULT 0,
  voice_ptt_only INTEGER NOT NULL DEFAULT 0,
  topic TEXT,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  nsfw INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES channel_categories(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (server_id) REFERENCES servers(id),
  UNIQUE (server_id, name COLLATE NOCASE)
);

INSERT INTO channels_new
SELECT id, server_id, name, type, created_at, voice_bitrate, voice_user_limit, voice_ptt_only,
       topic, slow_mode_seconds, nsfw, category_id, position
FROM channels;

DROP TABLE channels;
ALTER TABLE channels_new RENAME TO channels;

CREATE INDEX idx_channels_server_id ON channels(server_id);

PRAGMA foreign_keys=ON;

-- Server AFK + vanity invite slug (already have afk_channel_id from 0017; ensure column exists is no-op if present)
-- vanity_url: custom join slug separate from invite_code
ALTER TABLE servers ADD COLUMN vanity_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_vanity_url ON servers(vanity_url) WHERE vanity_url IS NOT NULL;

ALTER TABLE messages ADD COLUMN sticker_id TEXT;

ALTER TABLE dm_messages ADD COLUMN sticker_id TEXT;
