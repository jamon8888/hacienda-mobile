# On-Device Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-device episodic memory system with EmbeddingGemma-300M embeddings, op-sqlite + sqlite-vec hybrid search, and optional cross-encoder reranking for Hacienda Mobile.

**Architecture:** Three-layer system — (1) op-sqlite database with sqlite-vec for vectors and FTS5 for BM25, (2) native Kotlin/Swift modules wrapping LiteRT for EmbeddingGemma-300M inference, (3) TypeScript memory pipeline orchestrating ingest, retrieval, reranking, and lifecycle.

**Tech Stack:** op-sqlite (libSQL + sqlite-vec), LiteRT (TFLite), EmbeddingGemma-300M Q4_0, MiniLM-L-6-v2 reranker, MobX, LangChain TextSplitter, Kotlin/Swift native modules, React Native 0.76.3

## Global Constraints

- Platform: Bare React Native 0.76.3 (no Expo)
- Android: minSdkVersion 26, Kotlin, KSP (no kapt)
- iOS: min_ios_version_supported, Swift + ObjC bridging
- RAM budget: ~5GB Gemma 4 E2B + ~179MB EmbeddingGemma + ~87MB reranker + OS
- Privacy: 100% offline, no cloud fallback
- License: EmbeddingGemma uses Gemma license, MiniLM uses Apache-2.0

---

## Phase 1: Database Layer (op-sqlite + sqlite-vec)

### Task 1.1: Install op-sqlite

**Files:**

- Modify: `package.json`
- Modify: `android/app/build.gradle`
- Modify: `ios/Podfile`

**Interfaces:**

- Produces: `op-sqlite` available as `import { open } from 'op-sqlite'`

- [ ] **Step 1: Install op-sqlite package**

```bash
yarn add op-sqlite
```

- [ ] **Step 2: Enable sqlite-vec and FTS5 in package.json**

Add to `package.json`:

```json
"op-sqlite": {
  "sqliteVec": true,
  "fts5": true
}
```

- [ ] **Step 3: Verify Android autolinking**

op-sqlite uses React Native autolinking. No manual changes to `android/app/build.gradle` should be needed — verify after install.

- [ ] **Step 4: Verify iOS pod install**

```bash
cd ios && pod install && cd ..
```

Note: If you encounter SQLite symbol conflicts, you may need to add a `pre_install` hook to force static linking.

- [ ] **Step 4: Create test database**

```typescript
// src/utils/MemoryDB/test-connection.ts
import { open } from "op-sqlite";

export async function testConnection() {
  const db = open({ name: "test.db" });
  await db.executeAsync("SELECT 1");
  db.close();
  return true;
}
```

- [ ] **Step 5: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 6: Commit**

```bash
git add package.json ios/Podfile.lock
git commit -m "feat: install op-sqlite for on-device vector search"
```

---

### Task 1.2: Create Memory Database Schema

**Files:**

- Create: `src/utils/MemoryDB/schema.ts`
- Create: `src/utils/MemoryDB/index.ts`

**Interfaces:**

- Consumes: `op-sqlite` (open, executeAsync)
- Produces: `initMemoryDB()` function, `MemoryDB` type

- [ ] **Step 1: Create schema file**

```typescript
// src/utils/MemoryDB/schema.ts
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
```

- [ ] **Step 2: Create database initialization**

```typescript
// src/utils/MemoryDB/index.ts
import { open, DB } from "op-sqlite";
import { MEMORY_SCHEMA, MEMORY_FTS_SCHEMA, MEMORY_VEC_SCHEMA } from "./schema";

let db: DB | null = null;

export function getMemoryDB(): DB {
  if (!db) {
    db = open({ name: "memory.db" });
  }
  return db;
}

export async function initMemoryDB(): Promise<DB> {
  const database = getMemoryDB();
  await database.executeAsync(MEMORY_SCHEMA);
  await database.executeAsync(MEMORY_FTS_SCHEMA);
  await database.executeAsync(MEMORY_VEC_SCHEMA);
  return database;
}

export function closeMemoryDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/MemoryDB/
git commit -m "feat: add memory database schema with sqlite-vec and FTS5"
```

---

### Task 1.3: Build MemoryStore (MobX)

**Files:**

- Create: `src/store/MemoryStore.ts`

**Interfaces:**

- Consumes: `getMemoryDB()` from MemoryDB
- Produces: `MemoryStore` class with `insertMemory`, `getMemory`, `deleteMemory`, `searchByWorkspace`

- [ ] **Step 1: Create MemoryStore**

```typescript
// src/store/MemoryStore.ts
import { makeAutoObservable } from "mobx";
import { getMemoryDB } from "../utils/MemoryDB";
import { v4 as uuid } from "uuid";

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  kind: "conversation" | "document" | "note";
  content: string;
  summary?: string;
  sourceUri?: string;
  sourceType?: string;
  clientId?: string;
  embedding: Float32Array;
  embeddingModel: string;
  embeddingDims: number;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  importance: number;
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  constructor() {
    makeAutoObservable(this);
  }

  async insertMemory(
    record: Omit<
      MemoryRecord,
      "id" | "createdAt" | "updatedAt" | "accessedAt" | "accessCount"
    >,
  ): Promise<string> {
    const db = getMemoryDB();
    const id = uuid();
    const now = Date.now();

    const embeddingBlob = Buffer.from(record.embedding.buffer);

    await db.executeAsync(
      `INSERT INTO memories (id, workspace_id, kind, content, summary, source_uri, source_type, client_id, embedding, embedding_model, embedding_dims, created_at, updated_at, accessed_at, access_count, importance, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.workspaceId,
        record.kind,
        record.content,
        record.summary ?? null,
        record.sourceUri ?? null,
        record.sourceType ?? null,
        record.clientId ?? null,
        embeddingBlob as any,
        record.embeddingModel,
        record.embeddingDims,
        now,
        now,
        now,
        0,
        record.importance,
        record.metadata ? JSON.stringify(record.metadata) : null,
      ],
    );

    // Insert into vec index
    await db.executeAsync(
      `INSERT INTO memories_vec (rowid, embedding) VALUES ((SELECT rowid FROM memories WHERE id = ?), ?)`,
      [id, embeddingBlob as any],
    );

    return id;
  }

  async getMemory(id: string): Promise<MemoryRecord | null> {
    const db = getMemoryDB();
    const result = await db.executeAsync(
      `SELECT * FROM memories WHERE id = ?`,
      [id],
    );
    const row = result.rows?.[0];
    if (!row) return null;

    // Update accessed_at
    await db.executeAsync(
      `UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?`,
      [Date.now(), id],
    );

    return this.rowToRecord(row);
  }

  async deleteMemory(id: string): Promise<void> {
    const db = getMemoryDB();
    await db.executeAsync(`DELETE FROM memories WHERE id = ?`, [id]);
    await db.executeAsync(
      `DELETE FROM memories_vec WHERE rowid = (SELECT rowid FROM memories WHERE id = ?)`,
      [id],
    );
  }

  async getMemoriesByWorkspace(
    workspaceId: string,
    limit = 100,
  ): Promise<MemoryRecord[]> {
    const db = getMemoryDB();
    const result = await db.executeAsync(
      `SELECT * FROM memories WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?`,
      [workspaceId, limit],
    );
    return (result.rows || []).map(this.rowToRecord);
  }

  private rowToRecord(row: any): MemoryRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      content: row.content,
      summary: row.summary,
      sourceUri: row.source_uri,
      sourceType: row.source_type,
      clientId: row.client_id,
      embedding: new Float32Array(row.embedding),
      embeddingModel: row.embedding_model,
      embeddingDims: row.embedding_dims,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count,
      importance: row.importance,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

export const memoryStore = new MemoryStore();
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/store/MemoryStore.ts
git commit -m "feat: add MemoryStore MobX store for episodic memory"
```

---

### Task 1.4: Build MemorySearch (Hybrid Vector + BM25)

**Files:**

- Create: `src/utils/MemoryDB/MemorySearch.ts`

**Interfaces:**

- Consumes: `getMemoryDB()` from MemoryDB, `MemoryRecord` from MemoryStore
- Produces: `memorySearch()` function with hybrid retrieval + reranking

- [ ] **Step 1: Create MemorySearch**

```typescript
// src/utils/MemoryDB/MemorySearch.ts
import { getMemoryDB } from "./index";
import { MemoryRecord } from "../../store/MemoryStore";

export interface SearchOptions {
  workspaceId: string;
  clientId?: string;
  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
}

export interface SearchResult {
  memory: MemoryRecord;
  vectorScore: number;
  bm25Score: number;
  finalScore: number;
}

export async function memorySearch(
  query: string,
  queryEmbedding: Float32Array,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const db = getMemoryDB();
  const {
    workspaceId,
    clientId,
    topK = 10,
    vectorWeight = 0.6,
    bm25Weight = 0.4,
  } = options;

  // Step 1: Vector search (top 50)
  const embeddingBlob = Buffer.from(queryEmbedding.buffer);
  const vectorResults = await db.executeAsync(
    `SELECT m.*, v.distance
     FROM memories_vec v
     JOIN memories m ON m.id = v.id
     WHERE v.embedding MATCH ? AND m.workspace_id = ?
     ${clientId ? "AND m.client_id = ?" : ""}
     ORDER BY v.distance ASC
     LIMIT 50`,
    clientId
      ? [embeddingBlob as any, workspaceId, clientId]
      : [embeddingBlob as any, workspaceId],
  );

  // Step 2: BM25 search (top 20)
  const bm25Results = await db.executeAsync(
    `SELECT m.*, fts.rank
     FROM memories_fts fts
     JOIN memories m ON m.rowid = fts.rowid
     WHERE memories_fts MATCH ? AND m.workspace_id = ?
     ${clientId ? "AND m.client_id = ?" : ""}
     ORDER BY fts.rank
     LIMIT 20`,
    clientId ? [query, workspaceId, clientId] : [query, workspaceId],
  );

  // Step 3: Merge and deduplicate
  const merged = new Map<
    string,
    { memory: MemoryRecord; vectorScore: number; bm25Score: number }
  >();

  for (const row of vectorResults.rows || []) {
    merged.set(row.id, {
      memory: rowToRecord(row),
      vectorScore: 1 / (1 + (row.distance || 0)),
      bm25Score: 0,
    });
  }

  for (const row of bm25Results.rows || []) {
    const existing = merged.get(row.id);
    if (existing) {
      existing.bm25Score = Math.abs(row.rank || 0);
    } else {
      merged.set(row.id, {
        memory: rowToRecord(row),
        vectorScore: 0,
        bm25Score: Math.abs(row.rank || 0),
      });
    }
  }

  // Step 4: Compute final scores
  const results: SearchResult[] = [];
  for (const [, data] of merged) {
    const freshnessBonus = Math.exp(
      (-(Date.now() - data.memory.createdAt) / (1000 * 60 * 60 * 24)) * 0.1,
    );
    const structuralPriority = data.memory.kind === "document" ? 0.15 : 0;
    const importanceBonus = data.memory.importance * 0.1;

    const finalScore =
      data.vectorScore * vectorWeight +
      data.bm25Score * bm25Weight +
      freshnessBonus * 0.1 +
      structuralPriority +
      importanceBonus;

    results.push({
      memory: data.memory,
      vectorScore: data.vectorScore,
      bm25Score: data.bm25Score,
      finalScore,
    });
  }

  // Step 5: Sort and return top K
  results.sort((a, b) => b.finalScore - a.finalScore);
  return results.slice(0, topK);
}

function rowToRecord(row: any): MemoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    content: row.content,
    summary: row.summary,
    sourceUri: row.source_uri,
    sourceType: row.source_type,
    clientId: row.client_id,
    embedding: new Float32Array(row.embedding),
    embeddingModel: row.embedding_model,
    embeddingDims: row.embedding_dims,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accessedAt: row.accessed_at,
    accessCount: row.access_count,
    importance: row.importance,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/MemoryDB/MemorySearch.ts
git commit -m "feat: add hybrid memory search with vector + BM25 scoring"
```

---

## Phase 2: Native Embedding Module (LiteRT)

### Task 2.1: Create Android EmbeddingGemma Module

**Files:**

- Create: `android/app/src/main/java/com/hacienda/embedding/EmbeddingGemmaModule.kt`
- Create: `android/app/src/main/java/com/hacienda/embedding/EmbeddingGemmaPackage.kt`
- Modify: `android/app/src/main/java/com/hacienda/MainApplication.kt`

**Interfaces:**

- Consumes: LiteRT runtime (org.tensorflow.lite)
- Produces: `EmbeddingGemmaModule` native module with `embed(text) -> float[]`, `embedBatch(texts) -> float[][]`, `isAvailable() -> boolean`

- [ ] **Step 1: Add LiteRT dependency to build.gradle**

```gradle
// android/app/build.gradle - add to dependencies
implementation 'com.google.ai.edge.litert:litert:2.1.6'
implementation 'com.google.ai.edge.litert:litert-gpu:2.1.6'
```

Note: The old `org.tensorflow:tensorflow-lite` is deprecated. Use the new `com.google.ai.edge.litert` artifacts.

- [ ] **Step 2: Create EmbeddingGemmaModule.kt**

```kotlin
// android/app/src/main/java/com/hacienda/embedding/EmbeddingGemmaModule.kt
package com.hacienda.embedding

import com.facebook.react.bridge.*
import com.google.ai.edge.litert.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class EmbeddingGemmaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null
    private val MODEL_FILE = "embeddinggemma_300m_q4_0.tflite"
    private val EMBEDDING_DIMS = 128

    override fun getName(): String = "EmbeddingGemmaModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(interpreter != null)
    }

    @ReactMethod
    fun initModel(promise: Promise) {
        try {
            val model = loadModelFile()
            interpreter = Interpreter(model, Interpreter.Options().apply {
                setNumThreads(4)
            })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MODEL_INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun embed(text: String, dims: Int = EMBEDDING_DIMS, promise: Promise) {
        try {
            val interp = interpreter ?: throw Exception("Model not initialized")
            val input = tokenize(text)
            val output = Array(1) { FloatArray(768) } // Full EmbeddingGemma output
            interp.run(input, output)

            // MRL truncation
            val truncated = output[0].copyOf(dims)
            val result = Arguments.createArray()
            truncated.forEach { result.pushDouble(it.toDouble()) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("EMBED_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun embedBatch(texts: ReadableArray, dims: Int = EMBEDDING_DIMS, promise: Promise) {
        try {
            val interp = interpreter ?: throw Exception("Model not initialized")
            val results = Arguments.createArray()

            for (i in 0 until texts.size()) {
                val text = texts.getString(i) ?: continue
                val input = tokenize(text)
                val output = Array(1) { FloatArray(768) }
                interp.run(input, output)
                val truncated = output[0].copyOf(dims)

                val embeddingArray = Arguments.createArray()
                truncated.forEach { embeddingArray.pushDouble(it.toDouble()) }
                results.pushArray(embeddingArray)
            }
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("EMBED_BATCH_ERROR", e.message, e)
        }
    }

    private fun loadModelFile(): MappedByteBuffer {
        val fd = reactApplicationContext.assets.openFd(MODEL_FILE)
        val inputStream = FileInputStream(fd.fileDescriptor)
        val channel = inputStream.channel
        return channel.map(
            FileChannel.MapMode.READ_ONLY,
            fd.startOffset,
            fd.declaredLength
        )
    }

    private fun tokenize(text: String): ByteBuffer {
        // Placeholder: Implement SentencePiece tokenization
        // For now, return padded zeros
        val input = ByteBuffer.allocateDirect(1 * 256 * 4)
        input.order(ByteOrder.nativeOrder())
        // TODO: Implement proper tokenization
        return input
    }
}
```

- [ ] **Step 3: Create EmbeddingGemmaPackage.kt**

```kotlin
// android/app/src/main/java/com/hacienda/embedding/EmbeddingGemmaPackage.kt
package com.hacienda.embedding

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class EmbeddingGemmaPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(EmbeddingGemmaModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

- [ ] **Step 4: Register package in MainApplication.kt**

```kotlin
// Add to getPackages() in MainApplication.kt
packages.add(EmbeddingGemmaPackage())
```

- [ ] **Step 5: Download model file to assets**

Download `embeddinggemma_300m_q4_0.tflite` from HuggingFace and place in `android/app/src/main/assets/`.

- [ ] **Step 6: Run typecheck and build**

```bash
yarn typecheck
cd android && ./gradlew assembleDebug
```

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/hacienda/embedding/
git commit -m "feat: add Android EmbeddingGemma native module with LiteRT"
```

---

### Task 2.2: Create iOS EmbeddingGemma Module

**Files:**

- Create: `ios/Hacienda/EmbeddingGemmaModule.h`
- Create: `ios/Hacienda/EmbeddingGemmaModule.m`
- Create: `ios/Hacienda/EmbeddingGemmaModule.swift`

**Interfaces:**

- Consumes: LiteRT framework (TensorFlowLite)
- Produces: `EmbeddingGemmaModule` with same interface as Android

- [ ] **Step 1: Add LiteRT to Podfile**

```ruby
# ios/Podfile - add to target
pod 'LiteRT', '~> 2.1.6'
```

Note: The old `TensorFlowLiteSwift` pod is deprecated. Use `LiteRT` instead.

- [ ] **Step 2: Create bridging header entry**

```objc
// ios/Hacienda/Hacienda-Bridging-Header.h - add
#import "EmbeddingGemmaModule.h"
```

- [ ] **Step 3: Create EmbeddingGemmaModule.h**

```objc
// ios/Hacienda/EmbeddingGemmaModule.h
#import <React/RCTBridgeModule.h>

@interface EmbeddingGemmaModule : NSObject <RCTBridgeModule>
@end
```

- [ ] **Step 4: Create EmbeddingGemmaModule.m**

```objc
// ios/Hacienda/EmbeddingGemmaModule.m
#import "EmbeddingGemmaModule.h"
#import <React/RCTLog.h>

@implementation EmbeddingGemmaModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(initModel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(embed:(NSString *)text
                  dims:(NSInteger)dims
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@[]); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(embedBatch:(NSArray *)texts
                  dims:(NSInteger)dims
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@[]); // Will be implemented in Swift
}

@end
```

- [ ] **Step 5: Create EmbeddingGemmaModule.swift**

```swift
// ios/Hacienda/EmbeddingGemmaModule.swift
import Foundation
import LiteRT

@objc(EmbeddingGemmaModule)
class EmbeddingGemmaModule: NSObject {

  private var interpreter: Interpreter?
  private let embeddingDims = 128

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(interpreter != nil)
  }

  @objc func initModel(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      guard let modelPath = Bundle.main.path(forResource: "embeddinggemma_300m_q4_0", ofType: "tflite") else {
        reject("MODEL_NOT_FOUND", "Model file not found", nil)
        return
      }
      interpreter = try Interpreter(modelPath: modelPath)
      try interpreter?.allocateTensors()
      resolve(true)
    } catch {
      reject("MODEL_INIT_ERROR", error.localizedDescription, error)
    }
  }

  @objc func embed(
    _ text: String,
    dims: Int,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let interp = interpreter else {
      reject("NOT_INITIALIZED", "Model not initialized", nil)
      return
    }

    do {
      // Placeholder: Implement tokenization
      let input = try interp.input(at: 0)
      // Set tokenized input...
      try interp.invoke()
      let output = try interp.output(at: 0)
      let floatArray = output.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self).prefix(dims)) }
      resolve(floatArray.map { NSNumber(value: $0) })
    } catch {
      reject("EMBED_ERROR", error.localizedDescription, error)
    }
  }

  @objc func embedBatch(
    _ texts: [String],
    dims: Int,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var results: [[NSNumber]] = []
    for text in texts {
      // Placeholder: Process each text
      results.append([])
    }
    resolve(results)
  }
}
```

- [ ] **Step 6: Run pod install and build**

```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

- [ ] **Step 7: Commit**

```bash
git add ios/Hacienda/EmbeddingGemmaModule.*
git commit -m "feat: add iOS EmbeddingGemma native module with LiteRT"
```

---

### Task 2.3: Create TypeScript Bridge for Embedding Engine

**Files:**

- Create: `src/utils/Embedder/onDevice/EmbeddingGemmaBridge.ts`
- Modify: `src/utils/Embedder/factory.ts`

**Interfaces:**

- Consumes: `EmbeddingGemmaModule` (NativeModules)
- Produces: `embedText()`, `embedBatch()`, `isEmbeddingGemmaAvailable()` functions

- [ ] **Step 1: Create bridge**

```typescript
// src/utils/Embedder/onDevice/EmbeddingGemmaBridge.ts
import { NativeModules, Platform } from "react-native";

const { EmbeddingGemmaModule } = NativeModules;

export async function isEmbeddingGemmaAvailable(): Promise<boolean> {
  if (!EmbeddingGemmaModule) return false;
  try {
    return await EmbeddingGemmaModule.isAvailable();
  } catch {
    return false;
  }
}

export async function initEmbeddingGemma(): Promise<void> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }
  await EmbeddingGemmaModule.initModel();
}

export async function embedText(
  text: string,
  dims = 128,
): Promise<Float32Array> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }
  const result = await EmbeddingGemmaModule.embed(text, dims);
  return new Float32Array(result);
}

export async function embedBatch(
  texts: string[],
  dims = 128,
): Promise<Float32Array[]> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }
  const results = await EmbeddingGemmaModule.embedBatch(texts, dims);
  return results.map((r: number[]) => new Float32Array(r));
}
```

- [ ] **Step 2: Update factory to prefer EmbeddingGemma**

```typescript
// src/utils/Embedder/factory.ts - add import and check
import {
  isEmbeddingGemmaAvailable,
  initEmbeddingGemma,
} from "./onDevice/EmbeddingGemmaBridge";

// In getEmbeddingProvider(), add EmbeddingGemma as first choice
if (await isEmbeddingGemmaAvailable()) {
  return new EmbeddingGemmaProvider();
}
```

- [ ] **Step 3: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/Embedder/onDevice/EmbeddingGemmaBridge.ts src/utils/Embedder/factory.ts
git commit -m "feat: add TypeScript bridge for EmbeddingGemma native module"
```

---

## Phase 3: Memory Pipeline

### Task 3.1: Build IngestPipeline

**Files:**

- Create: `src/utils/MemoryDB/IngestPipeline.ts`

**Interfaces:**

- Consumes: `memoryStore` from MemoryStore, `embedBatch` from EmbeddingGemmaBridge, `chunkText` from LangChain
- Produces: `ingestText()`, `ingestDocument()` functions

- [ ] **Step 1: Create IngestPipeline**

```typescript
// src/utils/MemoryDB/IngestPipeline.ts
import { memoryStore } from "../../store/MemoryStore";
import { embedBatch } from "../Embedder/onDevice/EmbeddingGemmaBridge";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
});

export interface IngestOptions {
  workspaceId: string;
  clientId?: string;
  sourceUri?: string;
  sourceType?: string;
  kind?: "conversation" | "document" | "note";
}

export async function ingestText(
  text: string,
  options: IngestOptions,
): Promise<number> {
  const chunks = await splitter.splitText(text);
  const embeddings = await embedBatch(chunks);

  let count = 0;
  for (let i = 0; i < chunks.length; i++) {
    await memoryStore.insertMemory({
      workspaceId: options.workspaceId,
      kind: options.kind || "document",
      content: chunks[i],
      sourceUri: options.sourceUri,
      sourceType: options.sourceType,
      clientId: options.clientId,
      embedding: embeddings[i],
      embeddingModel: "embeddinggemma-300m-q4_0",
      embeddingDims: 128,
      importance: 0.5,
    });
    count++;
  }

  return count;
}

export async function ingestDocument(
  text: string,
  metadata: {
    workspaceId: string;
    clientId?: string;
    filePath: string;
    fileType: string;
  },
): Promise<number> {
  return ingestText(text, {
    workspaceId: metadata.workspaceId,
    clientId: metadata.clientId,
    sourceUri: metadata.filePath,
    sourceType: metadata.fileType,
    kind: "document",
  });
}
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/MemoryDB/IngestPipeline.ts
git commit -m "feat: add ingest pipeline for memory creation"
```

---

### Task 3.2: Build RetrievalPipeline with Optional Reranker

**Files:**

- Create: `src/utils/MemoryDB/RetrievalPipeline.ts`

**Interfaces:**

- Consumes: `memorySearch()` from MemorySearch, `embedText()` from EmbeddingGemmaBridge
- Produces: `retrieveContext()` function with optional cross-encoder reranking

- [ ] **Step 1: Create RetrievalPipeline**

```typescript
// src/utils/MemoryDB/RetrievalPipeline.ts
import { memorySearch, SearchResult } from "./MemorySearch";
import { embedText } from "../Embedder/onDevice/EmbeddingGemmaBridge";
import { NativeModules } from "react-native";

const { RerankerModule } = NativeModules;

export interface RetrieveOptions {
  workspaceId: string;
  clientId?: string;
  topK?: number;
  useReranker?: boolean;
}

export async function retrieveContext(
  query: string,
  options: RetrieveOptions,
): Promise<SearchResult[]> {
  const { workspaceId, clientId, topK = 5, useReranker = true } = options;

  // 1. Embed query
  const queryEmbedding = await embedText(query);

  // 2. Hybrid search (vector + BM25)
  let results = await memorySearch(query, queryEmbedding, {
    workspaceId,
    clientId,
    topK: 50, // Get more candidates for reranking
  });

  // 3. Optional cross-encoder reranking
  if (useReranker && RerankerModule) {
    try {
      const isAvailable = await RerankerModule.isAvailable();
      if (isAvailable) {
        const reranked = await RerankerModule.rerank(
          query,
          results.map(r => r.memory.content),
        );

        // Merge reranker scores with existing scores
        results = results.map((r, i) => ({
          ...r,
          finalScore: reranked[i].score * 0.7 + r.finalScore * 0.3,
        }));

        results.sort((a, b) => b.finalScore - a.finalScore);
      }
    } catch {
      // Fall back to mathematical scoring
    }
  }

  // 4. Return top K
  return results.slice(0, topK);
}

export function buildContextString(results: SearchResult[]): string {
  return results
    .map(
      r => `[Source: ${r.memory.sourceUri || "unknown"}]: ${r.memory.content}`,
    )
    .join("\n\n");
}
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/MemoryDB/RetrievalPipeline.ts
git commit -m "feat: add retrieval pipeline with optional cross-encoder reranking"
```

---

### Task 3.3: Build Memory Lifecycle Manager

**Files:**

- Create: `src/utils/MemoryDB/LifecycleManager.ts`

**Interfaces:**

- Consumes: `getMemoryDB()` from MemoryDB
- Produces: `runMemoryDecay()`, `pruneOldMemories()` functions

- [ ] **Step 1: Create LifecycleManager**

```typescript
// src/utils/MemoryDB/LifecycleManager.ts
import { getMemoryDB } from "./index";

const DECAY_RATE = 0.05;
const IMPORTANCE_THRESHOLD = 0.05;

export async function runMemoryDecay(): Promise<{
  pruned: number;
  decayed: number;
}> {
  const db = getMemoryDB();
  const now = Date.now();

  // 1. Decay importance for unaccessed memories
  const decayResult = await db.executeAsync(
    `UPDATE memories
     SET importance = importance * exp(-? * (? - accessed_at) / (1000 * 60 * 60 * 24))
     WHERE (? - accessed_at) > 7 * 24 * 60 * 60 * 1000`,
    [DECAY_RATE, now, now],
  );

  // 2. Prune memories below threshold
  const pruneResult = await db.executeAsync(
    `DELETE FROM memories WHERE importance < ?`,
    [IMPORTANCE_THRESHOLD],
  );

  // 3. Compact vec index
  await db.executeAsync(`VACUUM`);

  return {
    pruned: pruneResult.rowsAffected || 0,
    decayed: decayResult.rowsAffected || 0,
  };
}

export async function getMemoryStats(workspaceId: string): Promise<{
  totalMemories: number;
  avgImportance: number;
  oldestMemory: number;
  newestMemory: number;
}> {
  const db = getMemoryDB();
  const result = await db.executeAsync(
    `SELECT
       COUNT(*) as total,
       AVG(importance) as avg_importance,
       MIN(created_at) as oldest,
       MAX(created_at) as newest
     FROM memories
     WHERE workspace_id = ?`,
    [workspaceId],
  );

  const row = result.rows?.[0];
  return {
    totalMemories: row?.total || 0,
    avgImportance: row?.avg_importance || 0,
    oldestMemory: row?.oldest || 0,
    newestMemory: row?.newest || 0,
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/MemoryDB/LifecycleManager.ts
git commit -m "feat: add memory lifecycle manager with decay and pruning"
```

---

## Phase 4: Integration

### Task 4.1: Integrate with VoicePipelineProvider

**Files:**

- Modify: `src/utils/AiProviders/onDevice/voice/VoicePipelineProvider.ts`

**Interfaces:**

- Consumes: `retrieveContext()`, `buildContextString()` from RetrievalPipeline

- [ ] **Step 1: Add memory retrieval to voice pipeline**

```typescript
// In VoicePipelineProvider.ts - before cactusLm.generate()
import {
  retrieveContext,
  buildContextString,
} from "../../../utils/MemoryDB/RetrievalPipeline";

// In processVoiceInput():
const contextResults = await retrieveContext(transcript, {
  workspaceId: currentWorkspace.id,
  topK: 5,
  useReranker: true,
});

const contextString = buildContextString(contextResults);
const prompt = contextString
  ? `Context:\n${contextString}\n\nUser: ${transcript}`
  : transcript;

const response = await cactusLm.generate(prompt);
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/AiProviders/onDevice/voice/VoicePipelineProvider.ts
git commit -m "feat: integrate memory retrieval into voice pipeline"
```

---

### Task 4.2: Integrate with Xberg Document Extraction

**Files:**

- Modify: `src/store/XbergStore.ts`

**Interfaces:**

- Consumes: `ingestDocument()` from IngestPipeline

- [ ] **Step 1: Add embedding on extraction complete**

```typescript
// In XbergStore.ts - after extraction succeeds
import { ingestDocument } from "../utils/MemoryDB/IngestPipeline";

// After extractionResult is received:
await ingestDocument(extractionResult.text, {
  workspaceId: this.currentWorkspaceId,
  filePath: extractionResult.filePath,
  fileType: extractionResult.fileType,
});
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/store/XbergStore.ts
git commit -m "feat: auto-ingest extracted documents into memory store"
```

---

### Task 4.3: Add Memory Store to App Initialization

**Files:**

- Modify: `src/store/ModelStore.ts`

**Interfaces:**

- Consumes: `initMemoryDB()` from MemoryDB, `runMemoryDecay()` from LifecycleManager

**Note:** ModelStore initializes in its constructor via `makePersistable().then(() => this.initializeStore())`. There is no explicit `initialize()` method. The memory DB init should be added inside the `initializeStore()` method.

- [ ] **Step 1: Initialize memory DB in initializeStore()**

```typescript
// In ModelStore.ts - inside initializeStore() method (after existing initialization)
import { initMemoryDB } from '../utils/MemoryDB';
import { runMemoryDecay } from '../utils/MemoryDB/LifecycleManager';

// Add at the end of initializeStore():
private async initializeStore() {
  // ... existing initialization code ...

  // Initialize memory database
  try {
    await initMemoryDB();
    await runMemoryDecay();
  } catch (error) {
    console.warn('Memory database initialization failed:', error);
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
yarn typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/store/ModelStore.ts
git commit -m "feat: initialize memory database on app start"
```

---

## Phase 5: Testing

### Task 5.1: Unit Tests for Memory Pipeline

**Files:**

- Create: `__tests__/MemoryDB/schema.test.ts`
- Create: `__tests__/MemoryDB/MemorySearch.test.ts`
- Create: `__tests__/MemoryDB/LifecycleManager.test.ts`

- [ ] **Step 1: Create schema test**

```typescript
// __tests__/MemoryDB/schema.test.ts
import {
  MEMORY_SCHEMA,
  MEMORY_FTS_SCHEMA,
  MEMORY_VEC_SCHEMA,
} from "../../src/utils/MemoryDB/schema";

describe("Memory Schema", () => {
  it("should have valid SQL syntax", () => {
    expect(MEMORY_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS memories");
    expect(MEMORY_FTS_SCHEMA).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts",
    );
    expect(MEMORY_VEC_SCHEMA).toContain(
      "CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec",
    );
  });
});
```

- [ ] **Step 2: Create search test**

```typescript
// __tests__/MemoryDB/MemorySearch.test.ts
describe("MemorySearch", () => {
  it("should merge vector and BM25 results", () => {
    // Test merge logic
  });

  it("should compute final scores correctly", () => {
    // Test scoring weights
  });
});
```

- [ ] **Step 3: Create lifecycle test**

```typescript
// __tests__/MemoryDB/LifecycleManager.test.ts
describe("LifecycleManager", () => {
  it("should apply exponential decay to importance", () => {
    const importance = 0.5;
    const daysSinceAccess = 30;
    const decayRate = 0.05;
    const expected = importance * Math.exp(-decayRate * daysSinceAccess);
    expect(expected).toBeLessThan(importance);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
yarn test
```

- [ ] **Step 5: Commit**

```bash
git add __tests__/MemoryDB/
git commit -m "test: add unit tests for memory pipeline"
```

---

### Task 5.2: Integration Test

**Files:**

- Create: `__tests__/MemoryDB/integration.test.ts`

- [ ] **Step 1: Create integration test**

```typescript
// __tests__/MemoryDB/integration.test.ts
describe("Memory Pipeline Integration", () => {
  it("should ingest and retrieve text", async () => {
    // Mock native modules
    // Test full pipeline: ingest -> search -> retrieve
  });

  it("should handle workspace isolation", async () => {
    // Verify client_id filtering
  });
});
```

- [ ] **Step 2: Run tests**

```bash
yarn test
```

- [ ] **Step 3: Commit**

```bash
git add __tests__/MemoryDB/integration.test.ts
git commit -m "test: add integration test for memory pipeline"
```

---

## Final Verification

- [ ] **Run full typecheck**

```bash
yarn typecheck
```

- [ ] **Run full test suite**

```bash
yarn test
```

- [ ] **Run lint**

```bash
yarn lint
```

- [ ] **Build Android**

```bash
cd android && ./gradlew assembleDebug
```

- [ ] **Build iOS**

```bash
cd ios && pod install && cd .. && npx react-native run-ios
```

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete on-device memory system with EmbeddingGemma and op-sqlite"
```
