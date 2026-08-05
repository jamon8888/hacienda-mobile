# Xberg Integration Specification

> **Status**: Implemented — pending on-device verification
> **Version**: 1.0.0
> **Last Updated**: 2026-08-04

---

## Executive Summary

Integrate Xberg (document intelligence engine) into AnythingLLM Mobile for on-device document processing, extraction, OCR, and RAG-ready output. Native bridge approach (Kotlin/Swift) for full performance and feature access.

---

## Requirements

| Requirement | Spec |
|-------------|------|
| **Input** | User picks entire folder OR single file in conversations |
| **Bridge** | Native (Kotlin Android, Swift iOS) |
| **Max File Size** | 50MB for local processing |
| **OCR** | Yes, on-device (Tesseract/PaddleOCR) |
| **Offline** | Full offline support with cloud fallback |
| **VectorDB** | ObjectBox (existing Android, needs iOS implementation) |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AnythingLLM Mobile                         │
├─────────────────────────────────────────────────────────────────┤
│  React Native (TypeScript)                                     │
│  ├── XbergClient.ts           ← TypeScript wrapper             │
│  ├── XbergStore.ts            ← MobX state management          │
│  └── useXberg.ts              ← React hooks                    │
├─────────────────────────────────────────────────────────────────┤
│  Native Bridge (React Native NativeModules)                    │
│  ├── XbergModule.kt           ← Android native module          │
│  └── XbergModule.swift        ← iOS native module              │
├─────────────────────────────────────────────────────────────────┤
│  Xberg SDK                                                      │
│  ├── io.xberg:xberg-android  ← Android AAR (Maven)            │
│  └── Xberg Swift Package      ← iOS SPM                        │
├─────────────────────────────────────────────────────────────────┤
│  VectorDB (ObjectBox)                                          │
│  ├── VectorBox.kt             ← Android (existing)             │
│  └── VectorBox.swift          ← iOS (NEW)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User Input  │────▶│  Xberg Core  │────▶│  Chunking    │
│  (File/Folder)│     │  (Extract)   │     │  (Semantic)  │
└──────────────┘     └──────────────┘     └──────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌──────────────┐
                    │   OCR        │     │  Embedding   │
                    │  (Tesseract) │     │ (multilingual)│
                    └──────────────┘     └──────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────────────────────────┐
                    │         VectorDB (ObjectBox)     │
                    │    HNSW Index + Workspace Isolation│
                    └──────────────────────────────────┘
```

---

## Native Module Specifications

### Android (Kotlin)

**Dependency**:
```gradle
// android/app/build.gradle
dependencies {
    implementation 'io.xberg:xberg-android:1.0.8'
}
```

**Native Module** (`XbergModule.kt`):
```kotlin
package com.anythingllm.xberg

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

class XbergModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "XbergModule"
    
    @ReactMethod
    fun extractFile(filePath: String, options: ReadableMap, promise: Promise)
    
    @ReactMethod
    fun extractFolder(folderPath: String, options: ReadableMap, promise: Promise)
    
    @ReactMethod
    fun extractWithOCR(filePath: String, ocrOptions: ReadableMap, promise: Promise)
    
    @ReactMethod
    fun batchExtract(filePaths: ReadableArray, options: ReadableMap, promise: Promise)
    
    @ReactMethod
    fun detectFormat(filePath: String, promise: Promise)
    
    @ReactMethod
    fun getSupportedFormats(promise: Promise)
}
```

**Package Registration** (`XbergPackage.kt`):
```kotlin
package com.anythingllm.xberg

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext

class XbergPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): MutableList<NativeModule> {
        return ArrayList<NativeModule>().apply {
            add(XbergModule(reactContext))
        }
    }
    
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): MutableList<com.facebook.react.uimanager.ViewManager<*, *>> {
        return ArrayList()
    }
}
```

**MainApplication.kt Registration**:
```kotlin
// Add to getPackages()
packages.add(XbergPackage())
```

### iOS (Swift)

**Dependencies** (`ios/Podfile`):
```ruby
# Xberg document extraction
pod 'Xberg', :git => 'https://github.com/xberg-io/xberg.git', :tag => '1.0.8'

# ObjectBox vector database
pod 'ObjectBox'
```

**Native Module** (`XbergModule.swift`):
```swift
import Foundation
import Xberg

@objc(XbergModule)
class XbergModule: NSObject {
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc func extractFile(
        _ filePath: String,
        options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Xberg extraction logic
    }
    
    @objc func extractFolder(
        _ folderPath: String,
        options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Xberg batch extraction
    }
    
    @objc func extractWithOCR(
        _ filePath: String,
        ocrOptions: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Xberg OCR extraction
    }
    
    @objc func batchExtract(
        _ filePaths: NSArray,
        options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Xberg batch processing
    }
    
    @objc func detectFormat(
        _ filePath: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Format detection
    }
    
    @objc func getSupportedFormats(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Return supported formats
    }
}
```

**Bridge Header** (`AnythingLLM-Bridging-Header.h`):
```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
```

---

## VectorDB: ObjectBox iOS Support

### Current State
- **Android**: Fully integrated (ObjectBox 4.3.0, HNSW vector search, 768 dims)
- **iOS**: NOT integrated (no native module)

### Official ObjectBox Swift Package

**Installation Options**:

#### Option 1: Swift Package Manager (Recommended)
```swift
// Package.swift
.package(url: "https://github.com/objectbox/objectbox-swift-spm.git", from: "4.0.0")
```

#### Option 2: CocoaPods
```ruby
# ios/Podfile
pod 'ObjectBox'
```

### iOS VectorBox Implementation

**VectorBox.swift**:
```swift
import Foundation
import ObjectBox

class VectorBox {
    static let shared = VectorBox()
    
    private let store: Store
    private let box: Box<VectorEntity>
    
    init() throws {
        // Initialize ObjectBox store
        self.store = try Store()
        self.box = store.box(for: VectorEntity.self)
    }
    
    // MARK: - Insert
    func insert(workspaceSlug: String, embedding: [Float], metadata: String) throws -> Int64 {
        let entity = VectorEntity(
            embedding: embedding,
            metadata: metadata,
            workspaceSlug: workspaceSlug
        )
        return try box.put(entity)
    }
    
    func bulkInsert(workspaceSlug: String, vectors: [(embedding: [Float], metadata: String)]) throws -> [Int64] {
        let entities = vectors.map { VectorEntity(
            embedding: $0.embedding,
            metadata: $0.metadata,
            workspaceSlug: workspaceSlug
        )}
        return try box.put(entities)
    }
    
    // MARK: - Search (HNSW)
    func semanticSearch(workspaceSlug: String, queryVector: [Float], topN: Int) throws -> [(id: Int64, metadata: String, score: Float)] {
        // HNSW nearest neighbor search with cosine distance
        let query = try box.query(
            VectorEntity.workspaceSlug.equal(workspaceSlug)
                .and(VectorEntity.embedding.nearestNeighbors(queryVector, topN: topN))
        ).build()
        
        return try query.findWithScores().map { result in
            (id: result.object.id, 
             metadata: result.object.metadata ?? "{}", 
             score: result.score)
        }
    }
    
    // MARK: - Delete
    func resetVectorsForWorkspace(workspaceSlug: String) throws {
        let query = try box.query(
            VectorEntity.workspaceSlug.equal(workspaceSlug)
        ).build()
        try box.remove(query.find())
    }
    
    func deleteVectorsByIds(ids: [Int64]) throws {
        try box.remove(ids)
    }
    
    func reset() throws {
        try box.removeAll()
    }
    
    func count() throws -> Int {
        return try box.count()
    }
}
```

**VectorEntity.swift**:
```swift
import ObjectBox

// objectbox: entity
class VectorEntity {
    var id: Id = 0
    
    // objectbox: annotation = HnswIndex(dimensions: 768, distanceType: VectorDistanceType.cosine)
    var embedding: [Float]?
    var metadata: String?
    var workspaceSlug: String?
    
    init() {}
    
    init(embedding: [Float]?, metadata: String?, workspaceSlug: String?) {
        self.embedding = embedding
        self.metadata = metadata
        self.workspaceSlug = workspaceSlug
    }
}
```

**Note**: ObjectBox Swift uses code generation via Sourcery. After defining entities, run:
```bash
Pods/ObjectBox/setup.rb
```

---

## TypeScript Wrapper

### XbergClient.ts

```typescript
import { NativeModules, Platform } from 'react-native';

const { XbergModule } = NativeModules;

export interface XbergExtractOptions {
  outputFormat?: 'text' | 'markdown' | 'html' | 'json';
  enableOCR?: boolean;
  ocrBackend?: 'tesseract' | 'paddleocr';
  ocrLanguage?: string;
  enableTableExtraction?: boolean;
  enableCodeIntelligence?: boolean;
  chunkingStrategy?: 'semantic' | 'text' | 'markdown';
  maxFileSize?: number; // MB
}

export interface XbergExtractResult {
  content: string;
  metadata: {
    format: string;
    mimeType: string;
    size: number;
    pages?: number;
    language?: string;
    title?: string;
    author?: string;
  };
  tables?: Array<{
    rows: string[][];
    header?: string[];
  }>;
  chunks?: Array<{
    content: string;
    index: number;
    tokenCount: number;
  }>;
}

export interface XbergBatchResult {
  results: XbergExtractResult[];
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

export class XbergClient {
  /**
   * Extract content from a single file
   */
  static async extractFile(
    filePath: string,
    options: XbergExtractOptions = {}
  ): Promise<XbergExtractResult> {
    return XbergModule.extractFile(filePath, options);
  }

  /**
   * Extract content from all files in a folder
   */
  static async extractFolder(
    folderPath: string,
    options: XbergExtractOptions = {}
  ): Promise<XbergBatchResult> {
    return XbergModule.extractFolder(folderPath, options);
  }

  /**
   * Extract with OCR enabled
   */
  static async extractWithOCR(
    filePath: string,
    ocrOptions: {
      backend?: 'tesseract' | 'paddleocr';
      language?: string;
    } = {}
  ): Promise<XbergExtractResult> {
    return XbergModule.extractWithOCR(filePath, ocrOptions);
  }

  /**
   * Batch extract from multiple files
   */
  static async batchExtract(
    filePaths: string[],
    options: XbergExtractOptions = {}
  ): Promise<XbergBatchResult> {
    return XbergModule.batchExtract(filePaths, options);
  }

  /**
   * Detect file format
   */
  static async detectFormat(filePath: string): Promise<string> {
    return XbergModule.detectFormat(filePath);
  }

  /**
   * Get all supported formats
   */
  static async getSupportedFormats(): Promise<string[]> {
    return XbergModule.getSupportedFormats();
  }
}
```

### XbergStore.ts (MobX)

```typescript
import { makeAutoObservable } from 'mobx';
import { XbergClient, XbergExtractOptions, XbergExtractResult } from './XbergClient';

export type ProcessingMode = 'local' | 'cloud' | 'auto';
export type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

export interface XbergConfig {
  enabled: boolean;
  processingMode: ProcessingMode;
  chunkingStrategy: 'semantic' | 'text' | 'markdown';
  maxFileSize: number; // MB (default: 50)
  enableOCR: boolean;
  ocrBackend: 'tesseract' | 'paddleocr';
  enableTableExtraction: boolean;
  enableCodeIntelligence: boolean;
}

export class XbergStore {
  config: XbergConfig = {
    enabled: true,
    processingMode: 'local',
    chunkingStrategy: 'semantic',
    maxFileSize: 50,
    enableOCR: true,
    ocrBackend: 'tesseract',
    enableTableExtraction: true,
    enableCodeIntelligence: true,
  };

  status: ProcessingStatus = 'idle';
  progress: number = 0;
  currentFile: string | null = null;
  lastResult: XbergExtractResult | null = null;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setConfig(config: Partial<XbergConfig>) {
    this.config = { ...this.config, ...config };
  }

  async extractFile(filePath: string): Promise<XbergExtractResult | null> {
    this.status = 'processing';
    this.currentFile = filePath;
    this.progress = 0;
    this.error = null;

    try {
      const result = await XbergClient.extractFile(filePath, this.config);
      this.lastResult = result;
      this.status = 'completed';
      this.progress = 100;
      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Extraction failed';
      this.status = 'error';
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  async extractFolder(folderPath: string): Promise<XbergBatchResult | null> {
    this.status = 'processing';
    this.currentFile = folderPath;
    this.progress = 0;
    this.error = null;

    try {
      const result = await XbergClient.extractFolder(folderPath, this.config);
      this.status = 'completed';
      this.progress = 100;
      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Folder extraction failed';
      this.status = 'error';
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  reset() {
    this.status = 'idle';
    this.progress = 0;
    this.currentFile = null;
    this.lastResult = null;
    this.error = null;
  }
}

export const xbergStore = new XbergStore();
```

---

## React Hooks

### useXberg.ts

```typescript
import { useState, useCallback } from 'react';
import { xbergStore, XbergConfig } from '../store/XbergStore';
import { XbergExtractResult, XbergBatchResult } from '../utils/Xberg/XbergClient';

export interface UseXbergReturn {
  extractFile: (filePath: string) => Promise<XbergExtractResult | null>;
  extractFolder: (folderPath: string) => Promise<XbergBatchResult | null>;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  error: string | null;
  config: XbergConfig;
  updateConfig: (config: Partial<XbergConfig>) => void;
}

export function useXberg(): UseXbergReturn {
  const [status, setStatus] = useState(xbergStore.status);
  const [progress, setProgress] = useState(xbergStore.progress);
  const [error, setError] = useState(xbergStore.error);

  const extractFile = useCallback(async (filePath: string) => {
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const result = await xbergStore.extractFile(filePath);
      setStatus(result ? 'completed' : 'error');
      setProgress(100);
      return result;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Extraction failed');
      return null;
    }
  }, []);

  const extractFolder = useCallback(async (folderPath: string) => {
    setStatus('processing');
    setProgress(0);
    setError(null);

    try {
      const result = await xbergStore.extractFolder(folderPath);
      setStatus(result ? 'completed' : 'error');
      setProgress(100);
      return result;
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Folder extraction failed');
      return null;
    }
  }, []);

  return {
    extractFile,
    extractFolder,
    status,
    progress,
    error,
    config: xbergStore.config,
    updateConfig: xbergStore.setConfig.bind(xbergStore),
  };
}
```

---

## Integration with Existing Code

### Document Processing Flow

```
1. User picks file/folder (react-native-document-picker)
   ↓
2. XbergClient.extractFile/extractFolder()
   ↓
3. Native Xberg extraction (text, tables, OCR)
   ↓
4. Chunking (semantic/text/markdown)
   ↓
5. Embedding (multilingual-e5-small via cactus-react-native)
   ↓
6. VectorDB.bulkInsert() (ObjectBox)
   ↓
7. Document.create() (WatermelonDB) - stores vectorBoxIds
   ↓
8. Workspace documents updated
```

### Updated useAttachments.tsx

```typescript
// Add Xberg integration
import { useXberg } from '../hooks/useXberg';

const { extractFile, extractFolder } = useXberg();

const handleDocumentPick = async (file: DocumentPickerFile) => {
  // 1. Extract with Xberg
  const extracted = await extractFile(file.uri);
  if (!extracted) return;

  // 2. Chunk the content
  const chunks = chunkContent(extracted.content, config.chunkingStrategy);

  // 3. Embed chunks
  const embeddings = await embedder.embedBatch(chunks);

  // 4. Store in VectorDB
  const vectorBoxIds = await VectorDB.bulkInsert(workspaceSlug, 
    chunks.map((chunk, i) => ({
      embedding: embeddings[i],
      metadata: JSON.stringify({
        content: chunk,
        source: file.name,
        format: extracted.metadata.format,
      }),
    }))
  );

  // 5. Store in WatermelonDB
  await Document.create({
    workspaceId: workspace.id,
    name: file.name,
    vectorBoxIds: JSON.stringify(vectorBoxIds),
  });
};
```

---

## File Structure

```
android/app/src/main/java/com/anythingllm/
├── vectordb/                    # Existing
│   ├── VectorBox.kt
│   └── VectorBoxPackage.kt
└── xberg/                       # NEW
    ├── XbergModule.kt
    └── XbergPackage.kt

ios/AnythingLLM/
├── XbergModule.swift            # NEW
├── XbergModule.m                # NEW (ObjC bridge)
├── VectorBox.swift              # NEW
└── VectorEntity.swift           # NEW (ObjectBox entity - auto-generated)

ios/Podfile
├── pod 'Xberg'                  # NEW
└── pod 'ObjectBox'              # NEW

src/
├── utils/
│   └── Xberg/                   # NEW
│       ├── index.ts
│       ├── XbergClient.ts
│       ├── types.ts
│       └── chunker.ts
├── store/
│   └── XbergStore.ts            # NEW
├── hooks/
│   └── useXberg.ts              # NEW
└── screens/
    └── Documents/
        ├── ImportScreen.tsx     # NEW
        └── ProcessingScreen.tsx # NEW
```

---

## Configuration

### Workspace Config (WatermelonDB)

Add to Workspace model:
```typescript
xbergConfig: {
  enabled: boolean;
  processingMode: 'local' | 'cloud' | 'auto';
  chunkingStrategy: 'semantic' | 'text' | 'markdown';
  maxFileSize: number; // MB
  enableOCR: boolean;
  ocrBackend: 'tesseract' | 'paddleocr';
  enableTableExtraction: boolean;
  enableCodeIntelligence: boolean;
}
```

### App Config (AsyncStorage)

```typescript
{
  xberg: {
    enabled: true,
    processingMode: 'local',
    cloudEndpoint: null, // or 'https://api.xberg.io'
    ocrModelsPath: '/data/models/ocr',
    maxConcurrentJobs: 3,
  }
}
```

---

## Error Handling

| Error | Handling |
|-------|----------|
| File too large (>50MB) | Show warning, suggest cloud mode |
| Unsupported format | Show "format not supported" message |
| OCR failed | Retry with different backend, fallback to text-only |
| Network error (cloud mode) | Fallback to local WASM if available |
| Memory error | Reduce batch size, process sequentially |
| ObjectBox error | Retry with exponential backoff |

---

## Testing Strategy

1. **Unit Tests**: XbergClient, chunker, embedding pipeline
2. **Integration Tests**: Full extraction → VectorDB flow
3. **Platform Tests**: Android + iOS native modules
4. **Performance Tests**: Large files, batch processing, memory usage
5. **Offline Tests**: Verify full offline capability

---

## Implementation Phases

### Phase 1: Core (Week 1-2)
- [x] Android native module (XbergModule.kt)
- [x] TypeScript wrapper (XbergClient.ts)
- [x] Basic extraction (single file)
- [x] Integration with useAttachments

### Phase 2: iOS (Week 3)
- [x] iOS native module (XbergModule.swift)
- [x] ObjectBox iOS integration (VectorBox.swift)
- [x] Run ObjectBox code generator (`Pods/ObjectBox/setup.rb`)
- [ ] Cross-platform testing — **not started; nothing below has run on a device**

### Phase 3: Advanced (Week 4)
- [x] Folder extraction — recursive walk + `FolderPickerModule` for iOS, where
      `react-native-document-picker`'s `pickDirectory()` always rejects
- [x] OCR integration — `forceOcr` is applied automatically to images, which have no text layer.
      `ocr.language` is still pinned to `eng`: Tesseract needs per-language trained data bundled
      natively, so widening it depends on the native package, not on config
- [x] Batch processing — `extractBatch` splits work into 8-file native calls
- [x] Progress tracking — extraction and embedding report as separate phases (`IndexPhase`),
      since extraction happens for the whole batch before any file is embedded

### Phase 4: Polish (Week 5)
- [x] Error handling — a rejected batch chunk no longer discards the chunks that succeeded;
      untagged results are re-extracted per file rather than position-guessed
- [x] Offline fallback — `XbergUnavailableError` for builds without the native module; the
      plain-text fallback now refuses binary formats instead of embedding UTF-8 noise
- [x] Performance optimization — hash-skip before extraction, native batch cache, chunk dedupe
- [x] UI/UX improvements — phased progress bar; fixed a counter that triple-counted skipped
      and failed files and overshot 100%

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `io.xberg:xberg-android` | 1.0.8 | Android document extraction |
| `Xberg` (SPM) | 1.0.8 | iOS document extraction |
| `ObjectBox` (Android) | 4.3.0 | Vector DB (existing) |
| `ObjectBox` (iOS) | 4.x | Vector DB (new - SPM or CocoaPods) |
| `react-native-document-picker` | 9.3.1 | File/folder selection |
| `cactus-react-native` | 0.2.10 | Embeddings (existing) |

---

## Success Metrics

All of these are code-complete but **unverified on hardware** — the JS↔native contract is covered
by unit tests against a mocked module, which proves the wrapper's behaviour, not Xberg's.

- [ ] Extract text from PDF, DOCX, PPTX, XLSX
- [ ] OCR on scanned documents (Tesseract)
- [ ] Process folders with multiple files
- [ ] 50MB file processing under 30 seconds
- [ ] Offline extraction without network
- [ ] VectorDB storage and retrieval working on both platforms
- [ ] RAG search returning relevant results
