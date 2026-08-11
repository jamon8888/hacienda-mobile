# RAG + Xberg Ingestion + Needle — Full Implementation Plan

> **v1.1.0** · Synthesized from codebase + real docs (`docs.xberg.io`, `xberg-io/xberg`, `Cactus-Compute/needle`, `Geekgineer/needle-rs`) + prior plans (`RAG_OPTIMIZATION_STRATEGIES.md`, `XBERG_INGESTION_SPEED.md`, `NEEDLE_INTEGRATION.md`, `NEEDLE_IMPLEMENTATION_PLAN.md`).
> Rule: every phase ships green (`yarn typecheck` + `yarn lint`), increments without breaking current RAG, and can be rolled back by reverting a bounded change set.

---

## 0. Dependency map (why this order)

```
P1 folder import  ──► P2 delta-skip ──► P3 batched embed ──► P5 queued ingest
       └──────────────► P4 query levers (topK/filter/warm)
P6 Needle router (needs Android build; parallel to P1-P5)
```

- P1 is the base (folder import is currently a **TODO stub**).
- P2 and P3 both unlock the folder "feel" (instant re-import, fast first import).
- P4 improves query-time regardless.
- P6 is independent (native) and gated on the Android build being green.

---

## P1 — Real folder import (base; unblocks everything)

**Problem (code):** `handleImportFolder` in `src/screens/WorkspaceChat/PromptInput/Actions/Settings/Files/index.tsx:86` is a stub (`showToast('Folder import coming soon')`). `processImportedFile` (line 103) is per-file, uses Xberg extraction then `embedder.embedBatch → VectorDB.bulkInsert → Document.create`.

**Steps**

1. **Scan the folder** → resolve all supported paths (ext from `SUPPORTED_FILE_TYPES` keys) + filter ≤ 50 MB (reuse `MAX_FILE_SIZE`). Recursive into subfolders.
2. **Batch extraction** — call `XbergClient.extractBatch(paths, folderConfig)` once (parallel + cache) instead of N `extract()` round-trips.
3. **X module maturity** — in `XbergModule.kt:46` / `XbergModule.m`, split a batch result into `{results, errors}` instead of rejecting the whole batch on the first bad file (today `XbergModule.kt:52-59` aborts on FILE_NOT_FOUND).
4. **TS flow per file**: take `extracted.results[i].chunks` → embed → `bulkInsert` → `Document.create(...)` (reuse existing work in `processImportedFile`).
5. Mirror the config shape already used at line 105 (semantic chunking, tesseract OCR).

**Files** `Files/index.tsx`; `XbergModule.kt`, `.m`/`.swift`; `XbergClient.ts`, `Xberg/types.ts`; `XbergStore`.
**Accept:** picking a folder imports all supported docs; progress toast; empty/unsupported files skipped, not fatal; `yarn typecheck`/`lint` green.

---

## P2 — Snapshot / delta indexing (instant re-import)

**Problem:** re-opening a folder re-extracts/re-embeds everything. Xerg's cache helps extraction but not embedding; our code has no file-level skip (`Document` has no hash field).

**Tasks**

1. Add `contentHash` column to `workspace_documents` (+ migration in `src/database/migrations.ts`).
2. On import, `getSHA256Hash` (`src/utils/device.ts:227`) per file → if a `Document` with that hash in this workspace exists, skip (reuse `vectorBoxIds`, only new/changed files process).
3. Hash both content and, optionally, `workspace_slug` to avoid cross-workspace collisions.

**Files:**

- `src/database/models/Document.ts` (+ `DocumentType`), `migrations.ts`
- hash + skip logic in the import path (P1).
- Optionally a `content_hash` index via WMelonDB `@index`.

**Accept:** importing an unchanged folder completes quickly (cache + hash-skip); a changed file is the only one re-embedded.

---

## P3 — Batch the embedding (throughput)

**Problem:** `embedBatch` loops `embed()` per chunk (`src/utils/Embedder/onDevice/multilingual.ts:202-213`); folders = hundreds of llama.cpp forwards, the actual ingest bottleneck.

**Tasks**

1. Add a native batch path in the Cactus wrapper so N chunks embed in fewer forwards; if unavailable, pack chunks into `n_ctx`-bounded one-warm-context batches and loop those (same code as today but fewer init/per-call overhead).
2. Keep `embedBatch`/`splitAndEmbed` signatures; only internals change.

**Files:** `multilingual.ts`, `Embedder/onDevice/index.ts`, Cactus native if batch supported.
**Accept:** embedding a large folder is measurably faster than the current per-chunk loop on `arm64-v8a`.

---

## P5 — Queued background ingest (non-blocking UX)

**Tasks**

1. Dedicated `IndexingStore` (MobX `makeAutoObservable`) with a worker queue of `{file, status}` + progress events (`done/total`); runs off the JS thread, keeps the embedding context warm for the whole folder (skip the 3-min `keepAliveInterval` teardown mid-run — `multilingual.ts:53`).
2. Wire the folder picker to the queue; sheet shows live progress; user can keep chatting.
3. Failure of one file doesn't stop the folder.

**Accept:** folder import runs in background with progress; UI responsive.

---

## P6 — Needle on-device RAG router (per-turn skip/expand)

Sequence (details in `NEEDLE_IMPLEMENTATION_PLAN.md`):

1. **P0 spike** — needle-rs C ABI builds for `aarch64-linux-android`; `needle_load`+`needle_run` produce valid JSON for the `DOCUMENT_TOOLS`.
2. **P1 Android** — `libneedle.a` + `NeedleModule.{kt,swift,m}` init/route/release, serialized behind a native lock, JNI handle with `invalidate()`.
3. **P2 iOS** — staticlib + `NeedleModule.swift/.m`.
4. **P3 TS layer** — `src/utils/Needle/{types,NeedleClient,index}` `routeRag(prompt,{maxTopK})` with a `fallback` on any error/timeout.
5. **P4 store** — `NeedleStore.ts` (`makeAutoObservable`), `useNeedle`.
6. **P5** — gate **at top of** `getContextTexts` (`baseOpenAILikeProvider/index.ts:272`) → `skip`/`expand`/`fallback`.
7. **P6** — RNFS fetch of 22 MB weights into `/needle/`.

**Accept:** Android build + `routeRag` unit tests green; non-document questions skip RAG; doc questions use expandable topK; all failures fall back to the current path.

---

## Remaining quality/speed levers (all optional toggles)

- **P6.5 folder-scoped retrieval** — tag vectors with `folder` metadata; `search_in_folder` tool feeds the needle router → narrower HNSW (`RAG_OPTIMIZATION C1`). Requires `VectorBox*` metadata filter.
- **Query cache** — LRU of `(normalized query → ids)` per session in `baseOpenAILikeProvider`.
- **Warm embedder + adaptive topK/context cap** (see RAG doc C2/B2/B3).
- **Bend Xberg to 1.0.11** (`android/app/build.gradle:189`, iOS SPM) + set `use_cache`/`max_concurrent_extractions`.

---

## Files touched (mapped to today's code)

| #   | File                                                                                  | Change                                               |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| P1  | `.../PromptInput/Actions/Settings/Files/index.tsx`                                    | implement `handleImportFolder`, batch path           |
| P1  | `src/utils/Xberg/{types.ts,XbergClient.ts}`                                           | batch errors+config (`use_cache`,`max_concurrent`)   |
| P1  | `android/.../xberg/XbergModule.kt`, `ios/.../XbergModule.{swift,m}`                   | return per-file errors instead of whole-batch reject |
| P2  | `src/database/models/Document.ts`, `migrations.ts`                                    | `contentHash` column                                 |
| P3  | `src/utils/Embedder/onDevice/multilingual.ts`                                         | batched embedding                                    |
| P5  | `src/store/IndexingStore.ts` (+ hook)                                                 | ingest queue w/ progress                             |
| P6  | `com/hacienda/needle`, `src/utils/Needle`, `NeedleStore`, `baseOpenAILikeProvider` | router + gate                                        |

## Rollback

- Each phase is a scoped file set; the router gate (`getContextTexts`) is a single add with an always-`fallback` path. Reverting any phase = revert its files; no migration/data loss beyond the additive `contentHash` column (nullable).

---

## Design review — findings to resolve before coding

1. **`extractBatch` is all-or-nothing in Kotlin** (`XbergModule.kt:49-59` rejects the whole batch on the first bad file). Must change first (P1 pre-req) or one corrupt PDF in a folder kills the import.
2. **Incremental-skip coupling** — hash-skip (P2) must run BEFORE X-extract/embed; keep the `content_hash` check cheap (don't hash a huge PDF, reuse Xberg's seeded cache or hash file size+mtime first).
3. **WatermelonDB migration** — adding `content_hash` requires a `schemaVersion` bump + `migrations.ts` safeSchemaChange; test on both platforms. Don't add it via a comment/null-safe JSON only.
4. **`embedBatch` re-entrancy + keepAlive** — while batching a folder at 3-min keepalive may unload mid-run (P5 must pin it warm). Guard `_isWorking`.
5. **Needle handle + timeout** — `needle_run` is blocking; a JS 250 ms "timeout" can't cancel it. Serialize behind a mutex (Android) / ensure one in-flight route (store) to avoid corrupting a single `NeedleHandle`.
6. **Dimension consistency** — if a future Matryoshka fast-path stores truncated dims (e.g., 256), every stored vector AND the query must use the same `dimensions`, or HNSW mismatches. Only lower dims behind an explicit new-profile switch; never mix dims.
7. **Content-filter side effect** — default header/footer stripping (Xberg) already improves chunks; but callers that relied on full text (`storeProcessedFileAsText`) might see stripped output. Confirm no UX regression.
8. **Batch memory** — `max_concurrent_extractions` on low-RAM may spike memory; start at 2-4, expose cap via config.

---

_Reviewer: this plan merges the prior docs into one dependency-ordered, revert-safe sequence; the biggest code-accurate correction is that folder import is currently only a stub, making P1 more foundational than the earlier X-speed doc implied._
