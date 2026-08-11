# RAG Optimization Strategies — Best + Fast on Document Folders

> **v1.0.0** — decision menu for improving on-device RAG across the document-folder workflow (Xberg ingestion → multilingual embedding → ObjectBox HNSW → `getContextTexts` → LLM).
> Grounded in current code: `src/hooks/useAttachments.tsx:150` (per-file ingest), `src/utils/Embedder/onDevice/multilingual.ts:202` (sequential embed), `src/utils/VectorDB.ts:108` (HNSW search, topN=2), `src/utils/AiProviders/baseOpenAILikeProvider/index.ts:272` (query-time RAG).
> Rules: every lever is optional & toggled; nothing must ever block the JS thread; every failure degrades to today's behavior.

---

## 0. Where time actually goes today

| Stage                 | Cost                 | Bottleneck today                                                                                                   |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Folder ingest**     | minutes for a folder | `embedBatch` calls `embed()` **sequentially per chunk** (`multilingual.ts:202-213`); no resume; no file-level skip |
| **Query embed**       | small (1 prompt)     | one `CactusLM.embedding` call — fine                                                                               |
| **Retrieval**         | ms                   | HNSW on 384–768 dims, topN=2 — already fast at this corpus size                                                    |
| **Context injection** | medium               | context tokens inflate generation; topN=2 keeps it small but quality-limited                                       |
| **Model reload**      | spikes               | 3-min keepAlive teardown can unload mid-session (`multilingual.ts:53`)                                             |

Conclusion: **the wins are (1) indexing throughput, (2) query-time _skip/widen_ routing, (3) context budget, (4) precision.** Pure search speed is NOT the problem at folder scale.

---

## 1. Indexing — make folder ingestion fast (biggest perceived win)

### A1 — Incremental / delta indexing (HIGH impact, LOW-MED effort)

- Hash each file's content at ingest with existing `getSHA256Hash` (`src/utils/device.ts:227`); store hash on the `Document` row. On re-import of a folder, skip any file whose hash is unchanged (reuse `vectorBoxIds`, no re-embed, no re-insert).
- Folder re-open / "Update index" becomes near-instant; only new/changed files cost work.
- Files: `src/store/database/models/Document.ts` (+ migration), ingest call sites (`useAttachments.tsx`, `WorkspaceFilesActionSheet`).

### A2 — True batch embedding (HIGH impact, MED effort)

- `embedBatch` loops `embed` per chunk (one llama.cpp forward each). Add a native batch path so N chunks are embedded in fewer forward passes (Cactus `embedding()` supports one input; a batch API or a single high-`n_ctx` packed call would cut ingest ~N×).
- Fallback that needs zero native work: pack chunks up to the model's 512-token `n_ctx` and reuse one warm context across the folder (no per-call init).
- Files: `multilingual.ts:202` (and `Embedder/onDevice/index.ts:202`), Cactus native if batch is available.

### A3 — Queued background ingest (MED impact, MED effort)

- Folder import enqueues files; each file processed on a worker with a progress event (`filesDone/total`); embedder kept warm for the whole run (skip the 3-min keepAlive teardown mid-folder).
- Never blocks the UI / attachments sheet.
- Files: new `src/store/IndexingStore.ts` + hook; reuses `useAttachments` logic.

### A4 — Configurable chunk size (LOW effort, LOW-MED impact)

- `chunkSize = min(400, ctx-50)` is hard-coded (`useAttachments.tsx:151`). Make it a per-workspace/folder option (larger chunks = fewer embeddings = faster, coarser). Keep 400 default.

---

## 2. Query-time routing — only pay for RAG when it helps (biggest per-turn win)

### B1 — Needle router (already spec'd) — `docs/superpower/NEEDLE_INTEGRATION.md`

- Run the 26M tool-caller before embedding: `retrieve_documents` / `skip_rag` / `expand_search`. A "why is it sunny?" general question **skips embed + search + context tokens entirely** → biggest single-latency win and cleaner answers.
- Blocking risk & non-blocking fallback are already reviewed (see NEEDLE_IMPLEMENTATION_PLAN R-section).

### B2 — Keep embedder warm during active chat (LOW effort)

- `keepAliveInterval` (3 min) teardown can hit mid-conversation. While a workspace chat is open, keep the embedder context resident (extend keep-alive) so per-query init never happens. Files: `multilingual.ts:140`, `UIStore`/`WorkspaceChat` lifecycle.

### B3 — Query cache + dedupe (LOW effort)

- LRU of `(query-normalized → retrieval ids)` per session: a re-asked or near-identical question returns the cached `SemanticSearchResult[]` without re-embedding. Cheap to add in `baseOpenAILikeProvider`.

---

## 3. Quality — get the right chunks (best answers)

### C1 — Per-folder scoping (MED-HIGH effort, HIGH precision gain)

- Tag every vector with a `folder` field in metadata at ingest. Query path: "search this folder" narrows the HNSW pool → fewer false positives and faster scan.
- Requires `VectorBox.kt`/`VectorBox.swift` to support a metadata filter on `semanticSearch` (or a folder-scoped index), plus a folder picker in the chat sheet.

### C2 — Adaptive top-K with token budget (LOW-MED effort, MED quality+speed)

- Replace fixed `topN=2` with: retrieve `topK=6` from HNSW, keep only chunks that pass `minRelevanceScore` (already implemented via `filterSemanticSearchResults`, `index.ts:262`), then inject the best chunks under a hard context-token cap (e.g., ≤1200 tokens). Faster generation (less context) + fewer junk hits.

### C3 — Overlap + dedupe chunks (LOW effort)

- `chunkOverlap: 50` already; add dedupe of near-identical chunk text at insert time (hash-based) so the same paragraph from overlapping chunks isn't double-injected.

### C4 — Re-rank path for later (skip v1)

- A real on-device cross-encoder reranker is heavy (another model + latency). Not recommended until corpus size justifies it. Revisit when folders exceed ~10k chunks.

---

## 4. Recommended bundle ("Fast Folder RAG" profile)

For a single coherent v1 push, in priority order:

1. **A1** incremental hashing (folder re-imports are near-free — the #1 folder UX win)
2. **B1** Needle router (skip-RAG for non-document questions — the #1 per-turn win)
3. **A3** background queued ingest + warm embedder (UI never blocks on folders)
4. **B2** warm embedder in chat + **B3** query cache (kill per-query init/re-embed)
5. **C2** adaptive topK + token budget (quality + generation speed)
6. **A2** native batch embedding (indexing throughput, when Cactus supports it)

Each is independently toggleable; P0/P1 in the Needle plan (Android build + spike) unblocks B1, which is the highest-leverage single item.

---

## 5. Anti-goals / explicit non-solutions

- **Bigger topN by default** (more context → slower gen, more noise). Use C2 adaptive budget instead.
- **Cloud / API rerankers or hosted embeddings** — off-device, defeats privacy model.
- **Raising embedding model size just for quality** — `multilingual-e5-base` (768d) only +~2pts MTEB; dimension/size cost is worse than better chunking. Keep e5-small default, nomic for best quality.
- **Bloat context to "fit the whole folder"** — retrieval, not stuffing, is the point.

_Owners: VDB + Embedder (A2/A3/C1), Needle (B1), provider layer (B3/C2/C3), Document model + migrations (A1/C3)._
