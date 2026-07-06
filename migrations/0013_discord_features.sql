ALTER TABLE server_members ADD COLUMN nickname TEXT;

CREATE TABLE member_timeouts (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (server_id, user_id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE channel_categories (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

ALTER TABLE channels ADD COLUMN category_id TEXT REFERENCES channel_categories(id) ON DELETE SET NULL;
ALTER TABLE channels ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE TABLE channel_notification_settings (
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'inherit' CHECK (level IN ('inherit', 'all', 'mentions', 'nothing')),
  PRIMARY KEY (user_id, channel_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE user_presence (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'idle', 'dnd', 'invisible')),
  custom_status TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_user_id, to_user_id),
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE friendships (
  user_id TEXT NOT NULL,
  friend_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, friend_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE dm_channels (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dm_participants (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE dm_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX idx_dm_messages_channel ON dm_messages(channel_id, created_at DESC);

CREATE TABLE server_invites (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  creator_id TEXT NOT NULL,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE TABLE moderation_reports (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  reporter_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('message', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE automod_rules (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'spam', 'mention_spam', 'link')),
  action TEXT NOT NULL CHECK (action IN ('block', 'timeout', 'alert')),
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

ALTER TABLE servers ADD COLUMN rules_text TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN require_rules_acceptance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE member_rules_acceptance (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (server_id, user_id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE server_emojis (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (server_id, name COLLATE NOCASE),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE channel_webhooks (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_server_channel_created ON messages(server_id, channel_id, created_at DESC);
