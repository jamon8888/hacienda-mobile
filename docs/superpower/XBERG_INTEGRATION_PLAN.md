# Xberg Integration Plan — Hacienda Mobile

> **Status**: Ready to Implement
> **Version**: 1.0.0
> **Date**: 2026-08-02
> **Branch**: embedding-multilingual + agents

---

## Executive Summary

Integrate Xberg (document intelligence engine) into Hacienda Mobile for on-device document processing, extraction, OCR, and RAG-ready output. Native bridge approach (Kotlin Android, Swift iOS) for full performance and feature access.

---

## Decisions

| Decision              | Choice             | Rationale                                     |
| --------------------- | ------------------ | --------------------------------------------- |
| iOS language          | **Swift**          | Modern, type-safe, official Xberg SDK support |
| Chunking              | **Xberg built-in** | Avoids duplication with existing TextSplitter |
| OCR backend           | **Tesseract only** | Only backend guaranteed on iOS/Android        |
| File size enforcement | **Native module**  | 50MB limit at extraction layer                |
| VectorDB              | **ObjectBox**      | Already integrated on Android, needs iOS      |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hacienda Mobile                         │
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

## Files to Create/Modify

### Android (4 files)

| File                                                           | Action | Purpose                                       |
| -------------------------------------------------------------- | ------ | --------------------------------------------- |
| `android/app/build.gradle`                                     | Modify | Add `io.xberg:xberg-android:1.0.8` dependency |
| `android/app/src/main/java/com/hacienda/xberg/XbergModule.kt`  | Create | React Native native module wrapping Xberg     |
| `android/app/src/main/java/com/hacienda/xberg/XbergPackage.kt` | Create | Package registration                          |
| `android/app/src/main/java/com/hacienda/MainApplication.kt`    | Modify | Register `XbergPackage()`                     |

### iOS (5 files)

| File                              | Action | Purpose                                   |
| --------------------------------- | ------ | ----------------------------------------- |
| `ios/Podfile`                     | Modify | Add `ObjectBox` pod                       |
| `ios/Hacienda/XbergModule.swift`  | Create | React Native native module wrapping Xberg |
| `ios/Hacienda/XbergModule.m`      | Create | ObjC bridge for React Native              |
| `ios/Hacienda/VectorBox.swift`    | Create | ObjectBox wrapper for vector search       |
| `ios/Hacienda/VectorEntity.swift` | Create | ObjectBox entity definition               |

### TypeScript (5 files)

| File                             | Action | Purpose                             |
| -------------------------------- | ------ | ----------------------------------- |
| `src/utils/Xberg/index.ts`       | Create | Re-exports                          |
| `src/utils/Xberg/XbergClient.ts` | Create | Singleton wrapper for NativeModules |
| `src/utils/Xberg/types.ts`       | Create | TypeScript interfaces               |
| `src/store/XbergStore.ts`        | Create | MobX state management               |
| `src/hooks/useXberg.ts`          | Create | React hook                          |

### Integration Points (2 files)

| File                               | Action | Purpose                   |
| ---------------------------------- | ------ | ------------------------- |
| `src/hooks/useAttachments.tsx`     | Modify | Add Xberg extraction flow |
| `src/database/models/Workspace.ts` | Modify | Add `xbergConfig` field   |

---

## Native Module API

### Android (XbergModule.kt)

```kotlin
package com.hacienda.xberg

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

import io.xberg.ExtractInput
import io.xberg.ExtractionConfig
import io.xberg.Xberg

class XbergModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "XbergModule"

    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024L // 50MB
    }

    @ReactMethod
    fun extract(filePath: String, configJson: String, promise: Promise) {
        try {
            // Enforce file size limit
            val file = java.io.File(filePath)
            if (file.length() > MAX_FILE_SIZE) {
                promise.reject("FILE_TOO_LARGE", "File exceeds 50MB limit")
                return
            }

            val input = ExtractInput.from_uri(filePath)
            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extract(input, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun extractBatch(filePaths: ReadableArray, configJson: String, promise: Promise) {
        try {
            val inputs = mutableListOf<ExtractInput>()
            for (i in 0 until filePaths.size()) {
                val filePath = filePaths.getString(i)
                val file = java.io.File(filePath)
                if (file.length() > MAX_FILE_SIZE) {
                    promise.reject("FILE_TOO_LARGE", "File $filePath exceeds 50MB limit")
                    return
                }
                inputs.add(ExtractInput.from_uri(filePath))
            }

            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extractBatch(inputs, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getSupportedFormats(promise: Promise) {
        try {
            val formats = Xberg.listSupportedFormats()
            promise.resolve(formats.map { it.toJson() })
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
```

### Android (XbergPackage.kt)

```kotlin
package com.hacienda.xberg

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

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
    ): MutableList<ViewManager<*, *>> {
        return ArrayList()
    }
}
```

### iOS (XbergModule.swift)

```swift
import Foundation
import Xberg

@objc(XbergModule)
class XbergModule: NSObject {

    private let maxFileSize: Int64 = 50 * 1024 * 1024 // 50MB

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc func extract(
        _ filePath: String,
        configJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Enforce file size limit
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: filePath) else {
            reject("FILE_NOT_FOUND", "File does not exist", nil)
            return
        }

        do {
            let attrs = try fileManager.attributesOfItem(atPath: filePath)
            if let fileSize = attrs[.size] as? Int64, fileSize > maxFileSize {
                reject("FILE_TOO_LARGE", "File exceeds 50MB limit", nil)
                return
            }

            let input = try ExtractInput.from_uri(filePath)
            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extract(input: input, config: config)
            resolve(result.toJson())
        } catch {
            reject("EXTRACTION_ERROR", error.localizedDescription, error)
        }
    }

    @objc func extractBatch(
        _ filePaths: NSArray,
        configJson: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            var inputs: [ExtractInput] = []
            let fileManager = FileManager.default

            for case let filePath as String in filePaths {
                guard fileManager.fileExists(atPath: filePath) else {
                    reject("FILE_NOT_FOUND", "File \(filePath) does not exist", nil)
                    return
                }

                let attrs = try fileManager.attributesOfItem(atPath: filePath)
                if let fileSize = attrs[.size] as? Int64, fileSize > maxFileSize {
                    reject("FILE_TOO_LARGE", "File \(filePath) exceeds 50MB limit", nil)
                    return
                }

                inputs.append(try ExtractInput.from_uri(filePath))
            }

            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extractBatch(inputs: inputs, config: config)
            resolve(result.toJson())
        } catch {
            reject("EXTRACTION_ERROR", error.localizedDescription, error)
        }
    }

    @objc func getSupportedFormats(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let formats = Xberg.listSupportedFormats()
        resolve(formats.map { $0.toJson() })
    }
}
```

### iOS (XbergModule.m)

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(XbergModule, NSObject)

RCT_EXTERN_METHOD(extract:(NSString *)filePath
                  configJson:(NSString *)configJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(extractBatch:(NSArray *)filePaths
                  configJson:(NSString *)configJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSupportedFormats:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

---

## TypeScript Types

### src/utils/Xberg/types.ts

```typescript
export interface ExtractionConfig {
  outputFormat?: "text" | "markdown" | "html" | "json";
  forceOcr?: boolean;
  ocr?: {
    backend: "tesseract";
    language?: string;
    autoRotate?: boolean;
  };
  chunking?: {
    enabled: boolean;
    strategy?: "semantic" | "text" | "markdown";
    maxChunkSize?: number;
    chunkOverlap?: number;
  };
  tableExtraction?: boolean;
  codeIntelligence?: boolean;
}

export interface ExtractionResult {
  results: Array<{
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
      chunkType: string;
      embedding?: number[];
      metadata: {
        index: number;
        tokenCount: number;
      };
    }>;
  }>;
}

export interface SupportedFormat {
  extension: string;
  mimeType: string;
}
```

### src/utils/Xberg/XbergClient.ts

```typescript
import { NativeModules, Platform } from "react-native";
import { ExtractionConfig, ExtractionResult, SupportedFormat } from "./types";

const { XbergModule } = NativeModules;

export class XbergClient {
  static async extract(
    filePath: string,
    config: ExtractionConfig = {},
  ): Promise<ExtractionResult> {
    return XbergModule.extract(filePath, JSON.stringify(config));
  }

  static async extractBatch(
    filePaths: string[],
    config: ExtractionConfig = {},
  ): Promise<ExtractionResult> {
    return XbergModule.extractBatch(filePaths, JSON.stringify(config));
  }

  static async getSupportedFormats(): Promise<SupportedFormat[]> {
    return XbergModule.getSupportedFormats();
  }
}
```

### src/utils/Xberg/index.ts

```typescript
export { XbergClient } from "./XbergClient";
export * from "./types";
```

---

## MobX Store

### src/store/XbergStore.ts

```typescript
import { makeAutoObservable } from "mobx";
import { XbergClient } from "../utils/Xberg";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";

export type ProcessingStatus = "idle" | "processing" | "completed" | "error";

export class XbergStore {
  status: ProcessingStatus = "idle";
  progress: number = 0;
  currentFile: string | null = null;
  lastResult: ExtractionResult | null = null;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async extractFile(
    filePath: string,
    config: ExtractionConfig = {},
  ): Promise<ExtractionResult | null> {
    this.status = "processing";
    this.currentFile = filePath;
    this.progress = 0;
    this.error = null;

    try {
      const result = await XbergClient.extract(filePath, config);
      this.lastResult = result;
      this.status = "completed";
      this.progress = 100;
      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Extraction failed";
      this.status = "error";
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  async extractBatch(
    filePaths: string[],
    config: ExtractionConfig = {},
  ): Promise<ExtractionResult | null> {
    this.status = "processing";
    this.progress = 0;
    this.error = null;

    try {
      const result = await XbergClient.extractBatch(filePaths, config);
      this.lastResult = result;
      this.status = "completed";
      this.progress = 100;
      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Batch extraction failed";
      this.status = "error";
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  reset() {
    this.status = "idle";
    this.progress = 0;
    this.currentFile = null;
    this.lastResult = null;
    this.error = null;
  }
}

export const xbergStore = new XbergStore();
```

---

## React Hook

### src/hooks/useXberg.ts

```typescript
import { useState, useCallback } from "react";
import { xbergStore } from "../store/XbergStore";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";

export interface UseXbergReturn {
  extractFile: (
    filePath: string,
    config?: ExtractionConfig,
  ) => Promise<ExtractionResult | null>;
  extractBatch: (
    filePaths: string[],
    config?: ExtractionConfig,
  ) => Promise<ExtractionResult | null>;
  status: "idle" | "processing" | "completed" | "error";
  progress: number;
  error: string | null;
}

export function useXberg(): UseXbergReturn {
  const [status, setStatus] = useState(xbergStore.status);
  const [progress, setProgress] = useState(xbergStore.progress);
  const [error, setError] = useState(xbergStore.error);

  const extractFile = useCallback(
    async (filePath: string, config: ExtractionConfig = {}) => {
      setStatus("processing");
      setProgress(0);
      setError(null);

      const result = await xbergStore.extractFile(filePath, config);
      setStatus(result ? "completed" : "error");
      setProgress(100);
      if (!result) setError(xbergStore.error);
      return result;
    },
    [],
  );

  const extractBatch = useCallback(
    async (filePaths: string[], config: ExtractionConfig = {}) => {
      setStatus("processing");
      setProgress(0);
      setError(null);

      const result = await xbergStore.extractBatch(filePaths, config);
      setStatus(result ? "completed" : "error");
      setProgress(100);
      if (!result) setError(xbergStore.error);
      return result;
    },
    [],
  );

  return {
    extractFile,
    extractBatch,
    status,
    progress,
    error,
  };
}
```

---

## Integration with Existing Code

### useAttachments.tsx Changes

```typescript
// Add import at top
import { XbergClient } from "../utils/Xberg";
import { ExtractionConfig } from "../utils/Xberg/types";

// In handleDocumentPick function, replace existing extraction logic:
const handleDocumentPick = async (file: DocumentPickerFile) => {
  try {
    setStatus("processing");

    // 1. Get real path (existing)
    const realPath = await Storage.getRealPathFromUri(file.uri);

    // 2. NEW: Extract with Xberg
    const extractionConfig: ExtractionConfig = {
      outputFormat: "markdown",
      ocr: {
        backend: "tesseract",
        language: "eng",
      },
      chunking: {
        enabled: true,
        strategy: "semantic",
        maxChunkSize: config.chunkSize || 512,
        chunkOverlap: 50,
      },
    };

    const extracted = await XbergClient.extract(realPath, extractionConfig);
    if (!extracted.results[0]) {
      throw new Error("Extraction failed");
    }

    const content = extracted.results[0].content;
    const chunks = extracted.results[0].chunks || [];

    // 3. Store processed text (existing)
    storeProcessedFileAsText(file.name, content);

    // 4. Embed chunks using existing pipeline
    const embedder = getEmbeddingProvider();
    const chunkContents = chunks.map(c => c.content);
    const embeddings = await embedder.embedBatch(chunkContents);

    // 5. Store in VectorDB (existing)
    const vectorBoxIds = await VectorDB.bulkInsert(
      workspaceSlug,
      embeddings.map((emb, i) => ({
        embedding: emb,
        metadata: JSON.stringify({
          content: chunkContents[i],
          source: file.name,
          format: extracted.results[0].metadata.format,
        }),
      })),
    );

    // 6. Store in WatermelonDB (existing)
    await Document.create({
      workspaceId: workspace.id,
      name: file.name,
      vectorBoxIds: JSON.stringify(vectorBoxIds),
    });

    setStatus("completed");
  } catch (e) {
    setStatus("error");
    setError(e instanceof Error ? e.message : "Document processing failed");
  }
};
```

---

## Dependencies

### Android (build.gradle)

```gradle
dependencies {
    // Existing...
    implementation 'io.xberg:xberg-android:1.0.8'
}
```

### iOS (Podfile)

```ruby
target 'Hacienda' do
  # Existing...

  # ObjectBox vector database
  pod 'ObjectBox'
end
```

### iOS (Xcode SPM)

Add via Xcode → File → Add Package Dependencies:

- URL: `https://github.com/xberg-io/xberg.git`
- Version: `1.0.8`

---

## Error Handling

| Error                  | Code                 | Handling                         |
| ---------------------- | -------------------- | -------------------------------- |
| File too large (>50MB) | `FILE_TOO_LARGE`     | Show warning, suggest splitting  |
| File not found         | `FILE_NOT_FOUND`     | Show error message               |
| Unsupported format     | `UNSUPPORTED_FORMAT` | Show "format not supported"      |
| OCR failed             | `OCR_ERROR`          | Fallback to text-only extraction |
| Memory error           | `OUT_OF_MEMORY`      | Reduce batch size                |
| Extraction failed      | `EXTRACTION_ERROR`   | Show error, log details          |

---

## Implementation Phases

### Phase 1: Android Core (Week 1)

- [ ] Add Xberg dependency to `build.gradle`
- [ ] Create `XbergModule.kt` with `extract()`, `extractBatch()`, `getSupportedFormats()`
- [ ] Create `XbergPackage.kt`
- [ ] Register in `MainApplication.kt`
- [ ] Create TypeScript wrapper (`XbergClient.ts`, `types.ts`, `index.ts`)
- [ ] Test single file extraction on Android

### Phase 2: iOS Core (Week 2)

- [ ] Add ObjectBox to Podfile
- [ ] Add Xberg SPM package in Xcode
- [ ] Create `XbergModule.swift` + `XbergModule.m`
- [ ] Create `VectorBox.swift` + `VectorEntity.swift`
- [ ] Run ObjectBox code generator (`Pods/ObjectBox/setup.rb`)
- [ ] Test single file extraction on iOS

### Phase 3: Integration (Week 3)

- [ ] Create `XbergStore.ts` (MobX)
- [ ] Create `useXberg.ts` hook
- [ ] Integrate with `useAttachments.tsx`
- [ ] Add `xbergConfig` to Workspace model
- [ ] Test end-to-end flow on both platforms

### Phase 4: Advanced (Week 4)

- [ ] Folder extraction support
- [ ] Batch processing optimization
- [ ] Progress tracking UI
- [ ] Comprehensive error handling

### Phase 5: Polish (Week 5)

- [ ] Offline verification
- [ ] Performance testing (50MB files)
- [ ] Memory optimization
- [ ] UI/UX improvements
- [ ] Documentation

---

## Success Criteria

- [ ] Extract text from PDF, DOCX, PPTX, XLSX on Android
- [ ] Extract text from PDF, DOCX, PPTX, XLSX on iOS
- [ ] OCR scanned documents with Tesseract on both platforms
- [ ] Process folders with multiple files
- [ ] 50MB file processing completes without crash
- [ ] Offline extraction works without network
- [ ] VectorDB storage and retrieval on both platforms
- [ ] RAG search returns relevant results
- [ ] TypeScript type checking passes
- [ ] No regression in existing functionality

---

## Appendix: Xberg API Reference

### extract()

```kotlin
// Kotlin
fun extract(input: ExtractInput, config: ExtractionConfig): ExtractionResult
```

```swift
// Swift
func extract(input: ExtractInput, config: ExtractionConfig) throws -> ExtractionResult
```

### extractBatch()

```kotlin
// Kotlin
fun extractBatch(inputs: List<ExtractInput>, config: ExtractionConfig): ExtractionResult
```

```swift
// Swift
func extractBatch(inputs: [ExtractInput], config: ExtractionConfig) throws -> ExtractionResult
```

### listSupportedFormats()

```kotlin
// Kotlin
fun listSupportedFormats(): List<SupportedFormat>
```

```swift
// Swift
func listSupportedFormats() -> [SupportedFormat]
```

---

## Appendix: ObjectBox iOS Setup

### Installation

```ruby
# ios/Podfile
pod 'ObjectBox'
```

### Entity Definition

```swift
// VectorEntity.swift
import ObjectBox

// objectbox: entity
class VectorEntity {
    var id: Id = 0

    // objectbox: annotation = HnswIndex(dimensions: 768, distanceType: VectorDistanceType.cosine)
    var embedding: [Float]?
    var metadata: String?
    var workspaceSlug: String?

    init() {}
}
```

### Code Generation

```bash
cd ios
pod install
Pods/ObjectBox/setup.rb
```

---

## Notes

- Xberg Android uses `android-target` feature set which excludes PaddleOCR and ONNX-dependent features
- Tesseract is the only OCR backend guaranteed to work on both iOS and Android
- ObjectBox iOS requires code generation via Sourcery (run `Pods/ObjectBox/setup.rb`)
- All native module methods are Promise-based for async/await support in TypeScript
- File size limit (50MB) is enforced in native modules before calling Xberg SDK
