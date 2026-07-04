CREATE TABLE server_roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#99aab5',
  position INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '{}',
  is_everyone INTEGER NOT NULL DEFAULT 0,
  is_managed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id),
  UNIQUE (server_id, name COLLATE NOCASE)
);

CREATE TABLE member_roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (server_id) REFERENCES servers(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE,
  UNIQUE (server_id, user_id, role_id)
);

CREATE INDEX idx_server_roles_server_id ON server_roles(server_id);
CREATE INDEX idx_member_roles_user ON member_roles(server_id, user_id);
CREATE INDEX idx_member_roles_role ON member_roles(role_id);
