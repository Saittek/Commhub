ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_privacy_settings (
  user_id TEXT PRIMARY KEY,
  allow_dm_from INTEGER NOT NULL DEFAULT 1,
  allow_friend_requests INTEGER NOT NULL DEFAULT 1,
  show_activity_status INTEGER NOT NULL DEFAULT 1,
  allow_server_invites INTEGER NOT NULL DEFAULT 1,
  filter_explicit_content INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE server_bans (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (banned_by) REFERENCES users(id)
);

CREATE INDEX idx_server_bans_server_user ON server_bans(server_id, user_id);

CREATE TABLE audit_log_events (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  actor_user_id TEXT,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  reason TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX idx_audit_log_server ON audit_log_events(server_id, created_at DESC);

CREATE TABLE user_blocks (
  id TEXT PRIMARY KEY,
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE channels ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0;
