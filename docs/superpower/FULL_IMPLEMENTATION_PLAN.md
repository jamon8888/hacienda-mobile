# Full Implementation Plan — Hacienda Mobile Xberg + Embedding + UI

> **Status**: Ready to Implement
> **Version**: 2.0.0
> **Date**: 2026-08-02
> **Estimated Time**: 6-8 weeks (full-time)

---

## Codebase Conventions (MUST FOLLOW)

| Aspect              | Convention                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Navigation**      | Drawer Navigator only. Settings sub-pages use internal `goToPage()` + `NativeEventEmitter`. NO stack/tabs.        |
| **Styling**         | NativeWind v4 `className` + inline `style={{}}` for dynamic values. Dark mode first.                              |
| **Colors**          | `#1B1B1E` bg, `#27282A` cards, `#9F9FA0` muted, `#FFF` text, `#3B82F6` accent, `#6CE9A6` success, `#F97066` error |
| **Icons**           | Phosphor only (`phosphor-react-native`). Size 18-24, color `#FFF` or `#9F9FA0`.                                   |
| **Bottom Sheets**   | `@gorhom/bottom-sheet` v5 with `BottomSheetContext` registration pattern.                                         |
| **Settings Layout** | SafeView → absolute header → ScrollView with sections (uppercase label + card row + description).                 |
| **Modals**          | Overlay-based inline pickers (absolute positioned over screen) for settings.                                      |
| **State**           | MobX `makeAutoObservable` + singleton exports. React Context for providers.                                       |
| **File Picker**     | `react-native-document-picker` with `pick()`.                                                                     |
| **Settings Pages**  | `IWorkspacePageKey` type + `goToPage()` function + `NativeEventEmitter` for sub-pages.                            |

---

## Table of Contents

1. [Architecture](#architecture)
2. [Phase 1: Android Native Module](#phase-1-android-native-module)
3. [Phase 2: iOS Native Module](#phase-2-ios-native-module)
4. [Phase 3: TypeScript Layer](#phase-3-typescript-layer)
5. [Phase 4: MobX Store + Hooks](#phase-4-mobx-store--hooks)
6. [Phase 5: Workspace Settings — Documents Page](#phase-5-workspace-settings--documents-page)
7. [Phase 6: Enhanced Quick Attach](#phase-6-enhanced-quick-attach)
8. [Phase 7: Transcription Support](#phase-7-transcription-support)
9. [Phase 8: Integration & Testing](#phase-8-integration--testing)
10. [File Manifest](#file-manifest)
11. [Error Handling](#error-handling)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React Native (TypeScript)                    │
│                                                                      │
│  Settings Sub-Pages (internal goToPage navigation)                  │
│  ├── WorkspaceSettings/Main/index.tsx     (existing)                │
│  ├── WorkspaceSettings/EmbeddingSettings.tsx (existing)             │
│  └── WorkspaceSettings/DocumentsSettings.tsx  (NEW)                 │
│                                                                      │
│  Bottom Sheets (@gorhom/bottom-sheet + BottomSheetContext)           │
│  ├── ImportOptionsSheet.tsx         (folder/file/audio import)      │
│  ├── TranscriptionOptionsSheet.tsx  (model/language selection)      │
│  └── FileDetailsSheet.tsx           (file info + delete)            │
│                                                                      │
│  State Layer                                                         │
│  ├── XbergStore.ts                 (MobX: extraction state)         │
│  └── useXberg.ts                   (React hook)                     │
│                                                                      │
│  Existing Hooks (modified)                                           │
│  └── useAttachments.tsx            (Xberg extraction integrated)    │
├─────────────────────────────────────────────────────────────────────┤
│                      Native Bridge Layer                              │
│                                                                      │
│  Android: XbergModule.kt + XbergPackage.kt                          │
│  iOS: XbergModule.swift + XbergModule.m                             │
├─────────────────────────────────────────────────────────────────────┤
│                      SDK Layer                                        │
│                                                                      │
│  Android: io.xberg:xberg-android:1.0.8 + VectorBox.kt (existing)   │
│  iOS: Xberg SPM + ObjectBox pod + VectorBox.swift (NEW)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Android Native Module

**Time**: 2-3 days | **Files**: 4 files

### Step 1.1: Add Xberg Dependency

**File**: `android/app/build.gradle`

```gradle
android {
    defaultConfig {
        minSdkVersion 24  // Xberg requires Android 7.0+
    }
}

dependencies {
    implementation 'io.xberg:xberg-android:1.0.8'
}
```

### Step 1.2: Create XbergModule.kt

**File**: `android/app/src/main/java/com/hacienda/xberg/XbergModule.kt`

```kotlin
package com.hacienda.xberg

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import io.xberg.ExtractInput
import io.xberg.ExtractionConfig
import io.xberg.Xberg

class XbergModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "XbergModule"

    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024L
    }

    @ReactMethod
    fun extract(filePath: String, configJson: String, promise: Promise) {
        try {
            val file = java.io.File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File not found: $filePath")
                return
            }
            if (file.length() > MAX_FILE_SIZE) {
                promise.reject("FILE_TOO_LARGE", "File exceeds 50MB limit")
                return
            }
            val input = ExtractInput.from_uri(filePath)
            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extract(input, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun extractBatch(filePaths: ReadableArray, configJson: String, promise: Promise) {
        try {
            val inputs = mutableListOf<ExtractInput>()
            for (i in 0 until filePaths.size()) {
                val filePath = filePaths.getString(i)
                val file = java.io.File(filePath)
                if (!file.exists()) {
                    promise.reject("FILE_NOT_FOUND", "File not found: $filePath")
                    return
                }
                if (file.length() > MAX_FILE_SIZE) {
                    promise.reject("FILE_TOO_LARGE", "File exceeds 50MB: $filePath")
                    return
                }
                inputs.add(ExtractInput.from_uri(filePath))
            }
            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extractBatch(inputs, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getSupportedFormats(promise: Promise) {
        try {
            val formats = Xberg.listSupportedFormats()
            val result: WritableArray = Arguments.createArray()
            for (format in formats) {
                val map: WritableMap = Arguments.createMap()
                map.putString("extension", format.extension)
                map.putString("mimeType", format.mimeType)
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }
}
```

### Step 1.3: Create XbergPackage.kt

**File**: `android/app/src/main/java/com/hacienda/xberg/XbergPackage.kt`

```kotlin
package com.hacienda.xberg

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class XbergPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
        return ArrayList<NativeModule>().apply { add(XbergModule(reactContext)) }
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> {
        return ArrayList()
    }
}
```

### Step 1.4: Register in MainApplication.kt

**File**: `android/app/src/main/java/com/hacienda/MainApplication.kt`

```kotlin
import com.hacienda.xberg.XbergPackage

// In getPackages():
PackageList(this).packages.apply {
    add(XbergPackage())
}
```

### Step 1.5: Verify Build

```bash
cd android && ./gradlew assembleDebug
```

---

## Phase 2: iOS Native Module

**Time**: 3-4 days | **Files**: 5 files

### Step 2.1: Add ObjectBox Pod

**File**: `ios/Podfile`

```ruby
target 'Hacienda' do
  pod 'ObjectBox'
end
```

### Step 2.2: Add Xberg SPM

Xcode → File → Add Package Dependencies → `https://github.com/xberg-io/xberg.git` → `1.0.8`

### Step 2.3: Create VectorEntity.swift

**File**: `ios/Hacienda/VectorEntity.swift`

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
}
```

### Step 2.4: Create VectorBox.swift

**File**: `ios/Hacienda/VectorBox.swift`

```swift
import Foundation
import ObjectBox

@objc(VectorBox)
class VectorBox: NSObject {
    private var store: Store?
    private var box: Box<VectorEntity>?

    override init() {
        super.init()
        do {
            let directory = try Store.defaultDirectoryURL()
            store = try Store(directoryPath: directory.path)
            box = store?.box(for: VectorEntity.self)
        } catch {
            print("Failed to initialize ObjectBox: \(error)")
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func insert(_ embeddingArray: NSArray, metadata: String, workspaceSlug: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        let entity = VectorEntity()
        entity.embedding = embeddingArray as? [Float]
        entity.metadata = metadata
        entity.workspaceSlug = workspaceSlug
        do {
            let id = try box.put(entity)
            resolve(Int(id))
        } catch {
            reject("INSERT_ERROR", error.localizedDescription, error)
        }
    }

    @objc func bulkInsert(_ embeddings: NSArray, metadatas: NSArray, workspaceSlug: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        var entities: [VectorEntity] = []
        for i in 0..<embeddings.count {
            let entity = VectorEntity()
            entity.embedding = embeddings[i] as? [Float]
            entity.metadata = metadatas[i] as? String
            entity.workspaceSlug = workspaceSlug
            entities.append(entity)
        }
        do {
            let ids = try box.put(entities)
            resolve(ids.map { Int($0) })
        } catch {
            reject("BULK_INSERT_ERROR", error.localizedDescription, error)
        }
    }

    @objc func search(_ embedding: NSArray, workspaceSlug: String, limit: Int,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        guard let queryEmbedding = embedding as? [Float] else { reject("INVALID_INPUT", "Invalid embedding", nil); return }
        do {
            let query = try box.query { VectorEntity.embedding.nearest(query: queryEmbedding, limit: limit) }.build()
            let results = try query.find()
            let resultArray: [[String: Any]] = results.map { entity in
                ["id": Int(entity.id), "metadata": entity.metadata ?? "", "workspaceSlug": entity.workspaceSlug ?? ""]
            }
            resolve(resultArray)
        } catch {
            reject("SEARCH_ERROR", error.localizedDescription, error)
        }
    }

    @objc func delete(_ id: Int, resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        do { try box.remove(Id(id)); resolve(true) }
        catch { reject("DELETE_ERROR", error.localizedDescription, error) }
    }

    @objc func deleteByWorkspace(_ workspaceSlug: String,
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let box = box else { reject("STORE_ERROR", "ObjectBox not initialized", nil); return }
        do {
            let query = try box.query { VectorEntity.workspaceSlug.equal(workspaceSlug) }.build()
            let ids = try query.findIds()
            try box.remove(ids)
            resolve(true)
        } catch {
            reject("DELETE_ERROR", error.localizedDescription, error)
        }
    }
}
```

### Step 2.5: Create VectorBox.m + XbergModule.swift + XbergModule.m

**File**: `ios/Hacienda/VectorBox.m`

```objc
#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(VectorBox, NSObject)
RCT_EXTERN_METHOD(insert:(NSArray *)embedding metadata:(NSString *)metadata workspaceSlug:(NSString *)workspaceSlug resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(bulkInsert:(NSArray *)embeddings metadatas:(NSArray *)metadatas workspaceSlug:(NSString *)workspaceSlug resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(search:(NSArray *)embedding workspaceSlug:(NSString *)workspaceSlug limit:(NSInteger)limit resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(delete:(NSInteger)id resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deleteByWorkspace:(NSString *)workspaceSlug resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
```

**File**: `ios/Hacienda/XbergModule.swift`

```swift
import Foundation
import Xberg

@objc(XbergModule)
class XbergModule: NSObject {
    private let maxFileSize: Int64 = 50 * 1024 * 1024

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func extract(_ filePath: String, configJson: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: filePath) else { reject("FILE_NOT_FOUND", "File not found: \(filePath)", nil); return }
        do {
            let attrs = try fm.attributesOfItem(atPath: filePath)
            if let size = attrs[.size] as? Int64, size > maxFileSize {
                reject("FILE_TOO_LARGE", "File exceeds 50MB limit", nil); return
            }
            let input = try ExtractInput.from_uri(filePath)
            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extract(input: input, config: config)
            resolve(result.toJson())
        } catch { reject("EXTRACTION_ERROR", error.localizedDescription, error) }
    }

    @objc func extractBatch(_ filePaths: NSArray, configJson: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            var inputs: [ExtractInput] = []
            let fm = FileManager.default
            for case let filePath as String in filePaths {
                guard fm.fileExists(atPath: filePath) else { reject("FILE_NOT_FOUND", "File not found: \(filePath)", nil); return }
                let attrs = try fm.attributesOfItem(atPath: filePath)
                if let size = attrs[.size] as? Int64, size > maxFileSize {
                    reject("FILE_TOO_LARGE", "File exceeds 50MB: \(filePath)", nil); return
                }
                inputs.append(try ExtractInput.from_uri(filePath))
            }
            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extractBatch(inputs: inputs, config: config)
            resolve(result.toJson())
        } catch { reject("EXTRACTION_ERROR", error.localizedDescription, error) }
    }

    @objc func getSupportedFormats(_ resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        let formats = Xberg.listSupportedFormats()
        resolve(formats.map { ["extension": $0.extension, "mimeType": $0.mimeType] })
    }
}
```

**File**: `ios/Hacienda/XbergModule.m`

```objc
#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(XbergModule, NSObject)
RCT_EXTERN_METHOD(extract:(NSString *)filePath configJson:(NSString *)configJson resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(extractBatch:(NSArray *)filePaths configJson:(NSString *)configJson resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getSupportedFormats:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
```

### Step 2.6: Run ObjectBox Code Generator

```bash
cd ios && pod install && ruby Pods/ObjectBox/setup.rb
```

---

## Phase 3: TypeScript Layer

**Time**: 2 days | **Files**: 3 files

### Step 3.1: Create Types

**File**: `src/utils/Xberg/types.ts`

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
    tables?: Array<{ rows: string[][]; header?: string[] }>;
    chunks?: Array<{
      content: string;
      chunkType: string;
      embedding?: number[];
      metadata: { index: number; tokenCount: number };
    }>;
  }>;
}

export interface SupportedFormat {
  extension: string;
  mimeType: string;
}

export interface TranscriptionConfig {
  model: "tiny" | "base" | "small" | "medium" | "large-v3";
  language?: string;
  timestamps?: boolean;
}

export const SUPPORTED_FILE_TYPES = {
  document: [
    ".pdf",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".odt",
    ".ods",
    ".odp",
  ],
  text: [".txt", ".md", ".markdown", ".rst", ".org", ".rtf"],
  data: [".csv", ".tsv", ".json", ".yaml", ".xml"],
  web: [".html", ".htm"],
  email: [".eml", ".msg"],
  audio: [".mp3", ".m4a", ".wav", ".webm", ".mpga"],
  video: [".mp4", ".mpeg", ".webm"],
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"],
  code: [".js", ".ts", ".py", ".java", ".c", ".cpp", ".go", ".rs"],
};

export const DOCUMENT_PICKER_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
];
```

### Step 3.2: Create XbergClient

**File**: `src/utils/Xberg/XbergClient.ts`

```typescript
import { NativeModules } from "react-native";
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

  static isAudioFile(filePath: string): boolean {
    return [".mp3", ".m4a", ".wav", ".webm", ".mpga"].some(ext =>
      filePath.toLowerCase().endsWith(ext),
    );
  }

  static isImageFile(filePath: string): boolean {
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"].some(
      ext => filePath.toLowerCase().endsWith(ext),
    );
  }
}
```

### Step 3.3: Create Index

**File**: `src/utils/Xberg/index.ts`

```typescript
export { XbergClient } from "./XbergClient";
export * from "./types";
```

---

## Phase 4: MobX Store + Hooks

**Time**: 2 days | **Files**: 2 files

### Step 4.1: Create XbergStore

**File**: `src/store/XbergStore.ts`

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

### Step 4.2: Create useXberg Hook

**File**: `src/hooks/useXberg.ts`

```typescript
import { useState, useCallback } from "react";
import { xbergStore } from "../store/XbergStore";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";

export function useXberg() {
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

  return { extractFile, extractBatch, status, progress, error };
}
```

---

## Phase 5: Workspace Settings — Documents Page

**Time**: 4-5 days | **Files**: 6 files

This follows the EXACT pattern from `WorkspaceSettings/Main/index.tsx` and `EmbeddingSettings.tsx`.

### Step 5.1: Add Documents Page Key

**File**: `src/screens/WorkspaceSettings/index.tsx`

```typescript
// Add to IWorkspacePageKey type:
export type IWorkspacePageKey =
  | "main"
  | "name"
  | "system_prompt"
  | "temperature"
  | "context_length"
  | "embedding"
  | "documents";

// Add to PAGES object:
import { DocumentsSettingsView } from "./DocumentsSettings";
// 'documents': DocumentsSettingsView
```

### Step 5.2: Add Documents Row to Main Settings

**File**: `src/screens/WorkspaceSettings/Main/index.tsx`

Add after the Embedding row, before Vector Count:

```tsx
import { Files } from "phosphor-react-native";

{
  /* Documents */
}
<View className="w-full flex flex-col" style={{ gap: 12 }}>
  <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
    Documents
  </Text>
  <TouchableOpacity
    style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
    className="w-full flex flex-row items-center rounded-lg"
    onPress={() => goToPage("documents")}>
    <View className="flex flex-row gap-2 items-center">
      <Files size={18} color="#FFF" />
      <Text className="text-white text-lg">Documents</Text>
    </View>
    <View className="flex flex-1 flex-row gap-2 items-center justify-between">
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ color: "#9F9FA0" }}
        className="text-lg flex-1 text-right">
        {documentCount} files
      </Text>
      <CaretRight size={18} color="#FFF" />
    </View>
  </TouchableOpacity>
  <Text style={{ color: "#9F9FA0" }} className="text-xs">
    Import and manage documents for this workspace. Supports PDF, DOCX, audio,
    and 100+ formats via Xberg.
  </Text>
</View>;
```

### Step 5.3: Create DocumentsSettings View

**File**: `src/screens/WorkspaceSettings/DocumentsSettings.tsx`

Follows EXACT layout pattern from EmbeddingSettings.tsx:

```tsx
import { Text, TouchableOpacity, View, ScrollView } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Files,
  FolderOpen,
  FileText,
  Music,
  Trash,
  Warning,
} from "phosphor-react-native";
import uiStore from "@/store/UIStore";
import { useState, useCallback, useEffect } from "react";
import type { IWorkspacePageKey } from "./index";
import { useBottomSheet } from "@/contexts/BottomSheetContext";
import { BOTTOM_SHEET_NAMES } from "@/contexts/BottomSheetContext";

interface DocumentsSettingsProps {
  workspace: any;
  goToPage: (page: IWorkspacePageKey) => void;
}

export function DocumentsSettingsView({
  workspace,
  goToPage,
}: DocumentsSettingsProps) {
  const insets = useSafeAreaInsets();
  const { presentSheet } = useBottomSheet();
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentCount, setDocumentCount] = useState(0);

  useEffect(() => {
    // Load documents from WatermelonDB
    loadDocuments();
  }, [workspace.slug]);

  async function loadDocuments() {
    // TODO: Query Document model for this workspace
    // const docs = await Document.find([{ field: 'workspace_slug', value: workspace.slug }]);
    // setDocuments(docs);
    // setDocumentCount(docs.length);
  }

  function handleImportPress() {
    presentSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES);
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: "#1B1B1E" }}>
      {/* Header — EXACT pattern from EmbeddingSettings */}
      <View
        style={{
          paddingHorizontal: 30,
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={() => goToPage("main")}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text
          style={{ maxWidth: "80%" }}
          numberOfLines={1}
          ellipsizeMode="middle"
          className="text-white text-lg font-medium">
          Documents
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex flex-col"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 100,
          gap: 24,
          backgroundColor: "#1B1B1E",
        }}>
        {/* Import Actions */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Import
          </Text>

          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={handleImportPress}>
            <View className="flex flex-row gap-2 items-center">
              <FolderOpen size={18} color="#6CE9A6" />
              <Text className="text-white text-lg">Import Files</Text>
            </View>
            <View className="flex flex-1 flex-row gap-2 items-center justify-between">
              <Text
                style={{ color: "#9F9FA0" }}
                className="text-lg flex-1 text-right">
                Select files or folder
              </Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9F9FA0" }} className="text-xs">
            Import documents, audio, or folders. Supports PDF, DOCX, PPTX, XLSX,
            audio, images, and 100+ formats.
          </Text>
        </View>

        {/* Imported Files List */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Imported Files ({documentCount})
          </Text>

          {documents.length === 0 ? (
            <View
              style={{ backgroundColor: "#27282A", padding: 16 }}
              className="rounded-lg items-center">
              <Text style={{ color: "#9F9FA0" }} className="text-sm">
                No documents imported yet
              </Text>
            </View>
          ) : (
            documents.map(doc => (
              <TouchableOpacity
                key={doc.uuid}
                style={{ backgroundColor: "#27282A", padding: 12 }}
                className="rounded-lg flex flex-row items-center"
                onPress={() => {
                  /* Show file details sheet */
                }}>
                {getFileIcon(doc.type)}
                <View className="flex-1 ml-3">
                  <Text className="text-white text-sm">{doc.name}</Text>
                  <Text style={{ color: "#9F9FA0" }} className="text-xs">
                    {doc.type.toUpperCase()} • {doc.chunkCount || 0} chunks
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(doc)}>
                  <Trash size={18} color="#F97066" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Danger Zone */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={handleClearAll}
            style={{ backgroundColor: "rgba(122,39,26,0.2)" }}
            className="flex flex-row items-center justify-center rounded-lg p-4 mb-4">
            <Text style={{ color: "#F97066" }} className="text-lg font-medium">
              Clear All Documents
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeView>
  );
}

function getFileIcon(type: string) {
  const { FileText, Music, File } = require("phosphor-react-native");
  if (type?.includes("pdf")) return <FileText size={20} color="#F97066" />;
  if (type?.includes("audio")) return <Music size={20} color="#6CE9A6" />;
  return <File size={20} color="#9F9FA0" />;
}
```

### Step 5.4: Create ImportOptionsSheet (Bottom Sheet)

**File**: `src/screens/WorkspaceChat/PromptInput/Actions/ImportOptionsSheet/index.tsx`

Uses EXACT pattern from CitationsActionSheet:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Text, TouchableOpacity, View } from "react-native";
import { FolderOpen, File, Music, Camera } from "phosphor-react-native";
import { useBottomSheet } from "@/contexts/BottomSheetContext";
import { BOTTOM_SHEET_NAMES } from "@/contexts/BottomSheetContext";
import DocumentPicker from "react-native-document-picker";
import { DOCUMENT_PICKER_TYPES } from "@/utils/Xberg/types";

export default function ImportOptionsSheet() {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, dismissSheet } = useBottomSheet();

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES, bottomSheetRef);
  }, [registerSheet]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );

  async function handleFileImport() {
    try {
      const result = await DocumentPicker.pick({
        type: DOCUMENT_PICKER_TYPES,
        allowMultiSelection: true,
      });
      dismissSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES);
      // TODO: Process selected files with Xberg
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) console.error("File picker error:", e);
    }
  }

  async function handleFolderImport() {
    try {
      const result = await DocumentPicker.pickDirectory();
      dismissSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES);
      // TODO: Scan folder and import
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) console.error("Folder picker error:", e);
    }
  }

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={["40%"]}
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#1B1B1E" }}
      handleIndicatorStyle={{
        backgroundColor: "#9F9FA0",
        width: 45,
        margin: 10,
      }}>
      <BottomSheetView className="px-6 pb-8">
        <Text className="text-white text-lg font-semibold mb-4">
          Import to Workspace
        </Text>

        <TouchableOpacity
          style={{ backgroundColor: "#27282A", padding: 14 }}
          className="rounded-lg flex flex-row items-center gap-3 mb-3"
          onPress={handleFileImport}>
          <File size={20} color="#3B82F6" />
          <View>
            <Text className="text-white text-base">Import Files</Text>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              Select individual files
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ backgroundColor: "#27282A", padding: 14 }}
          className="rounded-lg flex flex-row items-center gap-3 mb-3"
          onPress={handleFolderImport}>
          <FolderOpen size={20} color="#6CE9A6" />
          <View>
            <Text className="text-white text-base">Import Folder</Text>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              Import all supported files from a folder
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ backgroundColor: "#27282A", padding: 14 }}
          className="rounded-lg flex flex-row items-center gap-3"
          onPress={() => {
            /* Camera OCR */
          }}>
          <Camera size={20} color="#F59E0B" />
          <View>
            <Text className="text-white text-base">Scan with Camera</Text>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              OCR physical documents
            </Text>
          </View>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
```

### Step 5.5: Register ImportOptionsSheet

**File**: `src/screens/WorkspaceChat/PromptInput/index.tsx`

Add import and render alongside other sheets:

```tsx
import ImportOptionsSheet from "./Actions/ImportOptionsSheet";

// In the component JSX, alongside other bottom sheets:
<ImportOptionsSheet />;
```

### Step 5.6: Add TranscriptionOptionsSheet

**File**: `src/screens/WorkspaceChat/PromptInput/Actions/TranscriptionOptionsSheet/index.tsx`

Same BottomSheetModal pattern, for selecting Whisper model and language when audio files are detected.

---

## Phase 6: Enhanced Quick Attach

**Time**: 2-3 days | **Files**: 1 file (modified)

### Step 6.1: Update useAttachments.tsx

**File**: `src/hooks/useAttachments.tsx`

Changes to existing file:

```typescript
// 1. Add Xberg import at top
import { XbergClient } from "@/utils/Xberg";
import { ExtractionConfig } from "@/utils/Xberg/types";

// 2. Expand allowed types in askForAttachment
const askForAttachment = useCallback(async () => {
  const result = await pick({
    allowMultiSelection: true, // Changed from false
    type: [
      "text/plain",
      "application/pdf",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/webm",
    ],
  });
  // Process each file...
}, []);

// 3. Update extractTextContentFromFile to use Xberg
const extractTextContentFromFile = useCallback(
  async (fileStoragePath: string, mimeType: string): Promise<string | null> => {
    try {
      // Use Xberg for all formats
      const config: ExtractionConfig = {
        outputFormat: "markdown",
        ocr: { backend: "tesseract", language: "eng" },
        chunking: {
          enabled: true,
          strategy: "semantic",
          maxChunkSize: 512,
          chunkOverlap: 50,
        },
      };
      const result = await XbergClient.extract(fileStoragePath, config);
      return result.results[0]?.content || null;
    } catch (e) {
      console.log("Xberg extraction failed, falling back:", e);
      // Fallback to existing logic for plain text
      switch (mimeType) {
        case "text/plain":
          const stats = await RNFS.stat(fileStoragePath);
          return await RNFS.read(fileStoragePath, stats.size, 0, "utf8");
        default:
          return null;
      }
    }
  },
  [],
);

// 4. Update processAttachment to handle multi-file
// (already handles single file, just needs the type expansion)
```

### Step 6.2: Add File Type Icons to Attachment Chips

**File**: `src/hooks/useAttachments.tsx`

Update `renderAttachments` to show file type icons:

```tsx
import { FileText, Music, File, Image } from "phosphor-react-native";

function getAttachmentIcon(type: string) {
  if (type?.includes("pdf")) return <FileText size={14} color="#F97066" />;
  if (type?.includes("audio")) return <Music size={14} color="#6CE9A6" />;
  if (type?.includes("image")) return <Image size={14} color="#F59E0B" />;
  if (type?.includes("word") || type?.includes("document"))
    return <FileText size={14} color="#3B82F6" />;
  return <File size={14} color="#9F9FA0" />;
}

// In renderAttachments, add icon before text:
{
  getAttachmentIcon(attachment.type);
}
<Text numberOfLines={1} ellipsizeMode="middle" className="text-white">
  {attachment.name}
</Text>;
```

---

## Phase 7: Transcription Support

**Time**: 3-4 days | **Files**: 3 files

### Step 7.1: Add Transcription to Native Modules

Add `transcribeAudio` method to both `XbergModule.kt` and `XbergModule.swift` (same pattern as `extract` but with transcription config).

### Step 7.2: Create TranscriptionOptionsSheet

**File**: `src/screens/WorkspaceChat/PromptInput/Actions/TranscriptionOptionsSheet/index.tsx`

Same BottomSheetModal pattern as ImportOptionsSheet. Uses overlay-based picker for model selection (like EmbeddingSettings engine picker).

### Step 7.3: Update XbergClient

**File**: `src/utils/Xberg/XbergClient.ts`

Add:

```typescript
static async transcribeAudio(filePath: string, model: string = 'tiny', language?: string): Promise<ExtractionResult> {
    return XbergModule.transcribeAudio(filePath, model, language || null);
}
```

---

## Phase 8: Integration & Testing

**Time**: 3-4 days

### Step 8.1: Add xbergConfig to Workspace Model

**File**: `src/database/models/Workspace.ts`

```typescript
@field('xberg_config')
xbergConfig: string; // JSON string

interface XbergConfig {
    enabled: boolean;
    ocrLanguage: string;
    chunkingStrategy: 'semantic' | 'text' | 'markdown';
    maxChunkSize: number;
    chunkOverlap: number;
    tableExtraction: boolean;
    codeIntelligence: boolean;
    transcriptionModel: 'tiny' | 'base' | 'small';
    autoTranscribe: boolean;
}
```

### Step 8.2: Verify

```bash
node node_modules/typescript/bin/tsc --noEmit
yarn test
```

---

## File Manifest

### Files to Create (14 files)

| #   | File                                                  | Purpose               |
| --- | ----------------------------------------------------- | --------------------- |
| 1   | `android/.../xberg/XbergModule.kt`                    | Android native module |
| 2   | `android/.../xberg/XbergPackage.kt`                   | Android package       |
| 3   | `ios/Hacienda/XbergModule.swift`                   | iOS native module     |
| 4   | `ios/Hacienda/XbergModule.m`                       | iOS ObjC bridge       |
| 5   | `ios/Hacienda/VectorBox.swift`                     | iOS ObjectBox wrapper |
| 6   | `ios/Hacienda/VectorBox.m`                         | iOS ObjC bridge       |
| 7   | `ios/Hacienda/VectorEntity.swift`                  | iOS entity            |
| 8   | `src/utils/Xberg/types.ts`                            | Types                 |
| 9   | `src/utils/Xberg/XbergClient.ts`                      | Client                |
| 10  | `src/utils/Xberg/index.ts`                            | Exports               |
| 11  | `src/store/XbergStore.ts`                             | MobX store            |
| 12  | `src/hooks/useXberg.ts`                               | Hook                  |
| 13  | `src/screens/WorkspaceSettings/DocumentsSettings.tsx` | Settings page         |
| 14  | `src/screens/.../ImportOptionsSheet/index.tsx`        | Bottom sheet          |

### Files to Modify (6 files)

| #   | File                                           | Changes              |
| --- | ---------------------------------------------- | -------------------- |
| 1   | `android/app/build.gradle`                     | Add Xberg dep        |
| 2   | `android/.../MainApplication.kt`               | Register package     |
| 3   | `ios/Podfile`                                  | Add ObjectBox        |
| 4   | `src/screens/WorkspaceSettings/index.tsx`      | Add 'documents' page |
| 5   | `src/screens/WorkspaceSettings/Main/index.tsx` | Add Documents row    |
| 6   | `src/hooks/useAttachments.tsx`                 | Xberg integration    |

---

## Error Handling

| Error          | Code                  | User Message                  |
| -------------- | --------------------- | ----------------------------- |
| File too large | `FILE_TOO_LARGE`      | "File exceeds 50MB limit"     |
| File not found | `FILE_NOT_FOUND`      | "File not found"              |
| Unsupported    | `UNSUPPORTED_FORMAT`  | "Format not supported"        |
| OCR failed     | `OCR_ERROR`           | "OCR failed, using text only" |
| Extraction     | `EXTRACTION_ERROR`    | "Extraction failed"           |
| Transcription  | `TRANSCRIPTION_ERROR` | "Transcription failed"        |

---

## Key Corrections from v1.0

1. **Navigation**: Settings sub-pages use `goToPage()` + `NativeEventEmitter`, NOT React Navigation stack
2. **Bottom Sheets**: Use `@gorhom/bottom-sheet` with `BottomSheetContext`, NOT React Native Modal
3. **Settings Layout**: Must follow SafeView → absolute header → ScrollView pattern exactly
4. **Styling**: NativeWind `className` + inline `style={{}}` hybrid, exact color palette
5. **Icons**: Phosphor only, specific icons that match existing patterns
6. **Overlay Pickers**: Use absolute positioned overlays for selection (like EmbeddingSettings), NOT Modal
7. **File Picker**: Integrate into existing `useAttachments` flow, don't create separate flow
8. **Multi-file**: Change `allowMultiSelection: false` to `true`
9. **Xberg Integration**: Replace `extractTextContentFromFile` with Xberg, keep fallback
