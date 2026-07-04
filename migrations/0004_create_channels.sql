CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id),
  UNIQUE (server_id, name COLLATE NOCASE)
);

CREATE INDEX idx_channels_server_id ON channels(server_id);
