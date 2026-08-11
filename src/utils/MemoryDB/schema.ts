export const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'conversation',
    content TEXT NOT NULL,
    summary TEXT,
    source_uri TEXT,
    source_type TEXT,
    client_id TEXT,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL DEFAULT 'embeddinggemma-300m-q4_0',
    embedding_dims INTEGER NOT NULL DEFAULT 128,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    importance REAL DEFAULT 0.5,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_client ON memories(client_id);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
`;

export const MEMORY_FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    summary,
    source_type,
    content='memories',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, summary, source_type)
    VALUES (new.rowid, new.content, new.summary, new.source_type);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, summary, source_type)
    VALUES ('delete', old.rowid, old.content, old.summary, old.source_type);
END;
`;

export const MEMORY_VEC_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
    embedding float32[128]
);
`;
