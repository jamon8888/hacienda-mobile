# Xberg Ingestion Speed + Needle — Integrated Folder-RAG Plan

> **v1.0.0** — how to make document-folder ingestion fast with Xberg's real batch/cache API, and where the Needle router fits in the same flow.
> Verified against official docs: [Xberg GitHub README](https://github.com/xberg-io/xberg), [Extraction Basics](https://docs.xberg.io/guides/extraction/), and our native `XbergModule.kt`.
> Complements: [`RAG_OPTIMIZATION_STRATEGIES.md`](RAG_OPTIMIZATION_STRATEGIES.md) (query-time levers), [`NEEDLE_INTEGRATION.md`](NEEDLE_INTEGRATION.md) (per-turn router).

---

## 0. Verified Xberg facts (from official docs)

| Fact | Implication for speed |
|---|---|
| `xberg-android` latest is **1.0.11**; we pinned **1.0.8** | bump to 1.0.11 for fixes |
| `extract_batch(ExtractInput[], config)` — runs docs **in parallel** | one call for a whole folder ≠ per-file loop |
| Batch-level config **`use_cache`** (content-hash cache) & **`max_concurrent_extractions`** | set them → skip unchanged docs, bound parallelism |
| **Content filtering on by default**: strips headers/footers/watermarks, **dedupes repeating text** | cleaner chunks → better RAG, less noise |
| **`output_format`**: plain / markdown / djot / html / JSON-tree / structured | pre-product stripping for RAG |
| **Code files bypass text chunking** → tree-sitter semantic chunks | dedicated code chunking for code folders |
| **Built-in embeddings (ONNX)** AND on-device chunking (`chunk`, semantic) | we keep our Cactus embedder — bigger gain is batching |
| **Content-hash caching** means re-extraction of an unchanged doc is a cache hit | pairs with our own embedding-side hash-skip |

Our current `XbergModule.kt` (`android/.../xberg/XbergModule.kt:46`) calls `Xberg.extractBatch(inputs, config)` but passes the JS-config `{}` — **it never sets `use_cache` or `max_concurrent_extractions`**, so the cache/parallel ceiling isn't being hit, and the folder path in the app still walks files one-by-one.

---

## 1. Ingestion-side speed (what Xberg actually gives us)

### X1 — Enable cache + parallelism in `extractBatch` (LOW effort, HIGH impact)
- Extend the `configJson` passed from JS to set:
  ```json
  { "batch": { "use_cache": true }, "concurrency": { "max_concurrent_extractions": 4 } }
  ```
- That alone makes re-importing a folder near-free (content-hash hits) and parallelizes parsing of many docs.
- Where: `XbergModule.kt` `extractBatch` (+ mirror in Swift), and the `XbergClient` called from `useAttachments.tsx` / `WorkspaceFilesActionSheet`.
- App-level: keep the per-file **our-hash skip** (RAG doc A1) so we also skip the *embedding* cost for unchanged docs (Xberg's cache only skips extraction, not embedding).

### X2. Real batch flow for a folder (MED effort, HIGH impact)
- Today the folder path is per-file: `extract → splitAndEmbed → bulkInsert`.
- Turn it into: **one `extract_batch(folderFiles)`** → then a single embedding + `bulkInsert` pass.
- This removes N native round-trips and lets Xberg parallelize parsing.
- Then the embedding pass is still sequential (`embedBatch` loops per chunk) — see X3.

### X3. Batch the embeddings (MED effort, HIGH impact)
- `Extractor` `embedBatch` loops `embed()` once per chunk (`multilingual.ts:202`). Folder files = hundreds of chunks → hundreds of llama.cpp forwards.
- Batch via Cactus (one call, many chunks) if the API allows; else pack chunks up to `n_ctx` and reuse one warm context. This is the real ingest bottleneck once Xberg parsing is parallel.
- (Owned by the Embedder team — same as RAG doc A1/A2.)

### X4. Output format & filter (LOW effort, quality / size)
- Request `output_format: "plain"` (`or "markdown"`) + rely on default header/footer stripping → cleaner, smaller chunks → better retrieval.

### X5. Bump `xberg-android` → `1.0.11` (LOW effort)
- Update `android/app/build.gradle`.

---

## 2. Where the Needle router fits (the "fast" half at query time)

Needle does **not** speed up ingestion (that's Xberg's batch/cache). Its job is to stop us from *paying* for retrieval when it's not needed, and to target it better when it is — the per-turn complement to fast indexing:

### N1. Skip / retrieve / expand routing (from `docs/superpower/NEEDLE_INTEGRATION.md`)
Before embedding at query time:
- `skip_rag` → don't embed/search/inject → **saves the whole embed+search+context** for non-document questions. Biggest single query-time win.
- `retrieve_documents`/`expand_search` → choose how many chunks to pull (already capping context tokens for gen speed).

### N2. Folders as tools → narrower, faster HNSW
- Expose `search_in_folder(folder, top_k)` as a needle tool. Needle picks the *right folder* → HNSW searches a smaller pool (fewer false positives + faster scan) — same win as RAG doc `C1` but **selected automatically by the router** instead of a manual picker.
- Combine with `retrieve_tools()` (needle-rs semantic ranking) only if the folder list grows large enough to overflow the 1024-token encoder — not needed at a handful of folders.

### 2. Both halves integrate in one pipeline:
```
FAST INGEST                      FAST QUERY
X1 batch+cache ──► extract       needle ──► is this a doc question?
X2 one batch flow  embedding     ├─ refuse→skip (no embed/search)
X3 batched embed ──► vectors     └─ yes → in_folder search (narrow pool)
        └────────────────────────────┴──────────► buildPrompt (context ≤ cap)
```

---

## 3. Recommended v1 integrated bundle
1. **X1** enable `use_cache` + `max_concurrent_extractions` in `extractBatch` (instant folder re-imports)
2. **X3** batch embeddings (removes the true ingest bottleneck)
3. **N1** Needle skip/expand router at query start (removes the true per-turn cost)
4. **N2** folder-as-tool for narrow, fast HNSW (precision + speed)
5. **X4** plain+stripped output (quality)
6. **A1 — own file-hash skip** (RAG doc) so re-import also skips embedding of unchanged docs

All levers optional & independently disable-able; every failure degrades to the current unconditional path.

---

## 4. Anti-goals (don't)
- Don't use Xberg's hosted/ONNX embeddings vs our Cactus — keep local, we already have the model.
- Don't bloat `topN` "because we can now ingest fast" — context cost grows; use N2/expand sparingly.
- Don't make folder import synchronous/UI-blocking (use the queue from `RAG_OPTIMIZATION_STRATEGIES.md`).

*Owners: Xberg-module + embedder batching (X1–X5), Needle router (N1–N2). Materialize X1/X2 first (no new deps, pure Kotlin/TS changes).*