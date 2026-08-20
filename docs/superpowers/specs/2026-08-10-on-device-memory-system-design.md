# On-Device Memory System Design Spec

> **Date:** 2026-08-10
> **Status:** Approved — Ready for implementation planning
> **Architecture:** Unified cactus-sys (Rust FFI) + op-sqlite + sqlite-vec

---

## 1. Overview

Design an on-device episodic memory system for Hacienda Mobile that enables voice and document chat with full context recall. The system runs 100% offline with HIPAA/legal compliance, using EmbeddingGemma-300M for embeddings, an optional cross-encoder reranker, and op-sqlite with sqlite-vec for hybrid vector + BM25 search.

### Key Constraints
- **RAM budget:** ~5GB for Gemma 4 E2B + ~179MB EmbeddingGemma + ~87MB reranker + OS = ~6.3-7.3GB total
- **Platform:** Bare React Native 0.76.3 (no Expo)
- **Privacy:** 100% offline, no cloud fallback, client-level data isolation
- **Model:** EmbeddingGemma-300M Q4_0 via LiteRT, 128-dim MRL truncation

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 React Native (TypeScript)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MemoryStore  │  │ MemorySearch │  │ IngestPipeline│  │
│  │ (MobX)       │  │ (hybrid)     │  │ (chunk+embed) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              cactus-sys Rust FFI Layer                   │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  LLM Engine      │  │  Embedding Engine           │  │
│  │  (llama.cpp)     │  │  (LiteRT via tflite-rs)     │  │
│  │  Gemma 4 E2B     │  │  EmbeddingGemma 300M Q4_0   │  │
│  │  ~5GB RAM        │  │  ~179MB RAM                 │  │
│  └──────────────────┘  └─────────────────────────────┘  │
│  ┌──────────────────┐                                   │
│  │  Reranker Engine │  (optional, device-dependent)     │
│  │  MiniLM-L-6-v2   │  ~87MB RAM                       │
│  └──────────────────┘                                   │
│                    UniFFI Bindings                       │
└──────────────────────────┬──────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Kotlin Module│  │ Swift Module │  │ op-sqlite    │
│ (Android)    │  │ (iOS)        │  │ + sqlite-vec │
│ LiteRT GPU   │  │ CoreML/ANE   │  │ + FTS5       │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stay bare React Native | Yes | No Expo dependency, follow existing patterns |
| Vector database | op-sqlite + sqlite-vec | Hybrid search (vector + BM25) significantly more accurate than vector-only |
| Embedding model | EmbeddingGemma-300M Q4_0 | Best mobile performance, 128-dim MRL, ~179MB |
| Reranker | MiniLM-L-6-v2 (optional) | 86.9MB cross-encoder, falls back to math scoring on low-RAM devices |
| Native module architecture | Unified cactus-sys | Single Rust crate owns all AI inference, UniFFI bindings |
| Memory pipeline | TypeScript | Iteration speed, no native rebuilds for scoring/decay logic |

---

## 3. Rust Crate Structure (cactus-sys)

### 3.1 LLM Engine

```rust
pub struct LlmEngine { /* llama.cpp context */ }

#[uniffi::export]
impl LlmEngine {
    fn init(model_path: &str, context_size: u32, n_gpu_layers: i32) -> Self;
    fn generate(prompt: &str, max_tokens: u32, temperature: f32) -> String;
    fn stream_generate(...) -> Stream;
    fn free(&self);
}
```

### 3.2 Embedding Engine

```rust
pub struct EmbeddingEngine { /* LiteRT interpreter */ }

#[uniffi::export]
impl EmbeddingEngine {
    fn init(model_path: &str, n_threads: i32) -> Self;
    fn embed(text: &str) -> Vec<f32>;                    // 768-dim
    fn embed_truncated(text: &str, dims: u32) -> Vec<f32>; // MRL truncation
    fn embed_batch(texts: Vec<String>) -> Vec<Vec<f32>>;  // batch for efficiency
    fn free(&self);
}
```

**MRL truncation** happens in Rust — `embed_truncated` calls `embed` then slices to `dims`. The 128-dim truncation is a zero-cost array slice.

**Platform-specific execution:**
- Android: LiteRT with Hexagon DSP or GPU delegate
- iOS: `.tflite` converted to CoreML at build time, runs on ANE

### 3.3 Reranker Engine (Optional)

```rust
pub struct RerankerEngine { /* MiniLM cross-encoder via LiteRT */ }

#[uniffi::export]
impl RerankerEngine {
    fn init(model_path: &str) -> Self;
    fn rerank(query: &str, documents: Vec<String>) -> Vec<ScoredDocument>;
    fn is_available() -> bool;  // checks device RAM
    fn free(&self);
}

pub struct ScoredDocument {
    pub id: String,
    pub score: f32,
    pub content: String,
}
```

### 3.4 Model Files

| Model | Format | Size | Location |
|-------|--------|------|----------|
| EmbeddingGemma-300M Q4_0 | `.tflite` | ~179MB | APK assets (Android), compiled CoreML (iOS) |
| MiniLM-L-6-v2 reranker | `.tflite` | ~86.9MB | APK assets (Android), compiled CoreML (iOS) |
| Gemma 4 E2B | GGUF | ~2.6GB | Downloaded at runtime |

---

## 4. Data Layer (op-sqlite + sqlite-vec)

### 4.1 Schema

```sql
-- Core memory table
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,              -- 'conversation' | 'document' | 'note'
    content TEXT NOT NULL,           -- original text chunk
    summary TEXT,                    -- optional LLM-generated summary
    source_uri TEXT,                 -- file path, URL, etc.
    source_type TEXT,                -- 'pdf' | 'voice' | 'chat' | 'note'
    client_id TEXT,                  -- for HIPAA/legal isolation
    embedding BLOB NOT NULL,        -- 128-dim float32 vector (serialized)
    embedding_model TEXT NOT NULL,   -- 'embeddinggemma-300m-q4_0'
    embedding_dims INTEGER NOT NULL DEFAULT 128,
    created_at INTEGER NOT NULL,     -- epoch ms
    updated_at INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    importance REAL DEFAULT 0.5,     -- 0.0-1.0
    metadata TEXT                    -- JSON blob for extensible fields
);

-- FTS5 for BM25 text search
CREATE VIRTUAL TABLE memories_fts USING fts5(
    content,
    summary,
    source_type,
    content='memories',
    content_rowid='rowid'
);

-- Triggers for FTS sync
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, summary, source_type)
    VALUES (new.rowid, new.content, new.summary, new.source_type);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, summary, source_type)
    VALUES ('delete', old.rowid, old.content, old.summary, old.source_type);
END;

-- sqlite-vec for vector search
CREATE VIRTUAL TABLE memories_vec USING vec0(
    embedding float32[128]
);

-- Indexes for workspace/client isolation
CREATE INDEX idx_memories_workspace ON memories(workspace_id);
CREATE INDEX idx_memories_client ON memories(client_id);
CREATE INDEX idx_memories_kind ON memories(kind);
```

### 4.2 Hybrid Search Query

```sql
-- Step 1: Vector candidates (top 50)
SELECT m.id, m.content, m.kind, m.source_type, m.created_at,
       v.distance
FROM memories_vec v
JOIN memories m ON m.id = v.id
WHERE v.embedding MATCH ? AND v.workspace_id = ?
ORDER BY v.distance ASC
LIMIT 50;

-- Step 2: BM25 re-scoring (top 20 from FTS5)
SELECT m.id, m.content, rank
FROM memories_fts fts
JOIN memories m ON m.rowid = fts.rowid
WHERE memories_fts MATCH ? AND m.workspace_id = ?
ORDER BY rank
LIMIT 20;
```

---

## 5. Memory Pipeline (TypeScript)

### 5.1 Ingestion Pipeline

```
Input (voice transcript / document text / chat message)
  │
  ▼
┌─────────────────────────┐
│ Chunker                │  LangChain TextSplitter
│ ~500 tokens per chunk  │  Overlap: 50 tokens
│ Preserve paragraphs    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Embedder               │  cactus-sys EmbeddingEngine
│ 128-dim MRL truncation │  Batch embed all chunks
│ ~15ms per chunk        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Store                  │  op-sqlite INSERT
│ memories table         │  + memories_vec (vector index)
│ + memories_fts (BM25)  │  + memories_fts (FTS5)
└─────────────────────────┘
```

### 5.2 Retrieval Pipeline (Hybrid + Rerank)

```
Query (user question)
  │
  ├──────────────────┐
  ▼                  ▼
┌──────────┐   ┌──────────┐
│ Vector   │   │ BM25     │
│ Search   │   │ Search   │
│ (top 50) │   │ (top 20) │
└────┬─────┘   └────┬─────┘
     │               │
     ▼               ▼
┌─────────────────────────┐
│ Merge & Deduplicate    │  Union by memory ID
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Cross-Encoder Reranker  │  MiniLM-L-6-v2 (optional)
│ Score (query, doc) pair │  ~87MB, NPU/GPU
│ Fallback: math scoring  │  if device RAM < 7GB
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Metadata Boost          │  freshness, importance, kind
│ (post-rerank adjustment)│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Top-K Selection (5-10)  │  Context window aware
└─────────────────────────┘
```

### 5.3 Scoring Weights (Mathematical Fallback)

When the cross-encoder reranker is unavailable:

```typescript
const finalScore =
  (vectorScore * 0.5) +                    // cosine similarity
  (freshnessBonus * 0.25) +                // e^(-age_days * 0.1)
  (structuralPriority * 0.15) +            // kind=='document' ? 0.15 : 0
  (importanceBonus * 0.1);                 // memories.importance
```

### 5.4 Lifecycle Management

```typescript
// Runs on app open
async function runMemoryDecay() {
  // 1. Update accessed_at for accessed memories
  // 2. Decay importance for unaccessed: importance *= e^(-days * 0.05)
  // 3. Prune memories below threshold (importance < 0.05)
  // 4. Compact Vec index (sqlite-vec VACUUM)
}
```

---

## 6. Integration with Existing Systems

### 6.1 CactusLM (LLM) — No Changes

Stays on `cactus-react-native`. When cactus-sys is ready, moves to Rust FFI. Memory pipeline feeds context via existing `generate()` API.

### 6.2 VoicePipelineProvider — Add Memory Retrieval

```typescript
// src/utils/AiProviders/onDevice/voice/VoicePipelineProvider.ts
async function processVoiceInput(transcript: string) {
  const context = await memorySearch({
    query: transcript,
    workspaceId: currentWorkspace.id,
    topK: 5
  });

  const prompt = buildPromptWithContext(transcript, context);
  const response = await cactusLm.generate(prompt);
  return response;
}
```

### 6.3 Xberg (Document Extraction) — Add Embedding on Ingest

```typescript
// After Xberg extraction completes
const chunks = chunkText(extractionResult.text);
const embeddings = await embeddingEngine.embedBatch(chunks);
await memoryStore.bulkInsert({
  chunks,
  embeddings,
  sourceUri: filePath,
  sourceType: extractionResult.fileType
});
```

### 6.4 WatermelonDB — No Changes

Memory store lives in op-sqlite, separate from WatermelonDB's workspace/thread models.

---

## 7. Error Handling

| Failure | Fallback |
|---------|----------|
| EmbeddingGemma init fails | Fall back to multilingual-e5-small (existing) |
| Reranker unavailable (low RAM) | Use mathematical scoring only |
| op-sqlite write fails | Queue retry, log warning |
| Vector index corrupted | Rebuild from memories table |
| Batch embed timeout | Process in smaller batches |
| LiteRT delegate unavailable | Fall back to CPU execution |

---

## 8. Testing Strategy

1. **Unit tests** — MemoryPipeline chunking, reranking scoring, decay math
2. **Integration tests** — Full ingest→search→rerank cycle with mock embeddings
3. **Native module tests** — EmbeddingGemma output dimensions, RerankerEngine score ranges
4. **Performance tests** — Embed latency P50/P95, search+rerank latency, memory footprint
5. **Device tests** — Verify on 6GB, 8GB, 12GB RAM devices

---

## 9. Open Questions

| Question | Options | Status |
|----------|---------|--------|
| Tokenizer for EmbeddingGemma | SentencePiece (bundled) vs external | TBD |
| Cross-encoder model version | MiniLM-L-6-v2 vs L-12-v2 | L-6-v2 chosen (smaller) |
| Workspace isolation | DB-level WHERE vs app-level filter | DB-level chosen |
| Max memories per workspace | 10K vs 50K vs unlimited | TBD — needs profiling |

---

## 10. Non-Goals

- Cloud embedding or search (100% offline)
- Multi-device sync (out of scope)
- Fine-tuning embedding model on device
- GPU memory sharing between LLM and embedding engines

---

*Spec written and ready for implementation planning.*
