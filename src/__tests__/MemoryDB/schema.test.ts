import {
  MEMORY_SCHEMA,
  MEMORY_FTS_SCHEMA,
  MEMORY_VEC_SCHEMA,
} from "../../utils/MemoryDB/schema";

describe("Memory Schema", () => {
  it("should have valid SQL syntax for memories table", () => {
    expect(MEMORY_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS memories");
    expect(MEMORY_SCHEMA).toContain("id TEXT PRIMARY KEY");
    expect(MEMORY_SCHEMA).toContain("workspace_id TEXT NOT NULL");
    expect(MEMORY_SCHEMA).toContain("content TEXT NOT NULL");
    expect(MEMORY_SCHEMA).toContain("embedding BLOB NOT NULL");
  });

  it("should have valid FTS5 schema", () => {
    expect(MEMORY_FTS_SCHEMA).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5",
    );
    expect(MEMORY_FTS_SCHEMA).toContain("content");
    expect(MEMORY_FTS_SCHEMA).toContain("summary");
  });

  it("should have valid vec0 schema", () => {
    expect(MEMORY_VEC_SCHEMA).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0",
    );
    expect(MEMORY_VEC_SCHEMA).toContain("embedding float32[128]");
  });
});
