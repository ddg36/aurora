-- Historical Nexus 2 journal schema (inactive; preserved for reference)
CREATE TABLE IF NOT EXISTS nexus_v2_runs (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    request_id    TEXT    NOT NULL,
    input_hash    TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'running',
    response_json TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at  INTEGER,
    delivered_at  INTEGER,
    PRIMARY KEY (usuario_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_nexus_v2_runs_status
    ON nexus_v2_runs(usuario_id, status, updated_at);
