ALTER TABLE servers ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_servers_is_public ON servers(is_public);
