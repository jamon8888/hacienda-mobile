# Cactus Transcription Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Android transcription (excluded from Xberg AAR) with Cactus Parakeet, so audio files can be transcribed on both iOS (Xberg Whisper) and Android (Cactus Parakeet).

**Architecture:** Native AudioDecoder modules (Kotlin/Swift) decode audio files to PCM16 samples. A TypeScript `CactusTranscriptionService` orchestrates: read file → native decode → CactusSTT.transcribe(). `XbergClient.transcribeAudio()` routes to the correct engine per platform.

**Tech Stack:** Kotlin (Android), Swift (ObjC bridge), TypeScript, CactusSTT from cactus-react-native, React Native NativeModules.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `android/app/src/main/java/com/anythingllm/xberg/AudioDecoderModule.kt` | **NEW** — Android native module: decode audio file path → PCM16 int16 samples as ReadableArray |
| `android/app/src/main/java/com/anythingllm/xberg/AudioDecoderPackage.kt` | **NEW** — React Native package registration for AudioDecoderModule |
| `android/app/src/main/java/com/anythingllm/xberg/XbergPackage.kt` | **MODIFY** — Add AudioDecoderPackage to the packages list |
| `ios/AnythingLLM/AudioDecoderModule.swift` | **NEW** — iOS native module: decode audio file path → PCM16 samples as [Int] |
| `ios/AnythingLLM/AudioDecoderModule.m` | **NEW** — ObjC bridge for AudioDecoderModule |
| `ios/AnythingLLM/AnythingLLM-Bridging-Header.h` | **MODIFY** — Import AudioDecoderModule.m |
| `src/utils/Xberg/CactusTranscriptionService.ts` | **NEW** — TS orchestrator: file → PCM decode → CactusSTT.transcribe() |
| `src/utils/Xberg/XbergClient.ts` | **MODIFY** — Route transcribeAudio() to Cactus on Android |
| `src/screens/WorkspaceChat/PromptInput/Actions/TranscriptionOptionsSheet/index.tsx` | **MODIFY** — Show active engine (Whisper on iOS, Parakeet on Android) |
| `src/utils/Xberg/types.ts` | **MODIFY** — Add TranscriptionEngine type |

---

## Global Constraints

- React Native bridge can only send: primitives, arrays, maps. No raw binary over the bridge.
- CactusSTT.transcribe() expects `audio: number[]` (PCM16 LE signed int16 samples at 16kHz mono).
- Audio files may be any sample rate; native decoder must resample to 16kHz.
- Audio files may be stereo; native decoder must convert to mono.
- Android: use `android.media.MediaCodec` + `android.media.AudioFormat` for decoding (no external deps).
- iOS: use `AVAudioEngine`/`AVAudioFile` for decoding (native frameworks only).
- Parakeet model `parakeet-tdt-0.6b-v3-int4` is already bundled (used for voice input).
- Xberg Whisper (iOS) uses its own model download/cache at `~/.cache/xberg/whisper/`.

---

### Task 1: Android AudioDecoderModule

**Files:**
- Create: `android/app/src/main/java/com/anythingllm/xberg/AudioDecoderModule.kt`
- Create: `android/app/src/main/java/com/anythingllm/xberg/AudioDecoderPackage.kt`
- Modify: `android/app/src/main/java/com/anythingllm/xberg/XbergPackage.kt`

**Interfaces:**
- Consumes: file path (String) from JS
- Produces: `{ samples: number[], sampleRate: number, durationMs: number }` via Promise

- [ ] **Step 1: Create AudioDecoderModule.kt**

```kotlin
package com.anythingllm.xberg

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Decodes audio files to PCM16 samples at 16kHz mono for CactusSTT.
 *
 * Uses MediaExtractor + MediaCodec (hardware-accelerated) for decoding,
 * with manual resampling if the source isn't 16kHz.
 */
class AudioDecoderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AudioDecoderModule"

    @ReactMethod
    fun decodeToPCM16(filePath: String, promise: Promise) {
        try {
            val extractor = MediaExtractor()
            extractor.setDataSource(filePath)

            if (extractor.trackCount == 0) {
                extractor.release()
                promise.reject("NO_AUDIO_TRACK", "No audio track found in: $filePath")
                return
            }

            // Find the audio track
            var audioTrackIndex = -1
            var audioFormat: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) {
                    audioTrackIndex = i
                    audioFormat = format
                    break
                }
            }

            if (audioTrackIndex < 0 || audioFormat == null) {
                extractor.release()
                promise.reject("NO_AUDIO_TRACK", "No audio track found in: $filePath")
                return
            }

            extractor.selectTrack(audioTrackIndex)
            val sourceSampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val sourceChannels = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            val durationUs = audioFormat.getLong(MediaFormat.KEY_DURATION)

            // Set up decoder
            val mime = audioFormat.getString(MediaFormat.KEY_MIME)!!
            val decoder = MediaCodec.createDecoderByType(mime)
            decoder.configure(audioFormat, null, null, 0)
            decoder.start()

            val pcmData = mutableListOf<Short>()
            val bufferInfo = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false

            while (!outputDone) {
                // Feed input
                if (!inputDone) {
                    val inputIndex = decoder.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val inputBuffer = decoder.getInputBuffer(inputIndex)!!
                        val sampleSize = extractor.readSampleData(inputBuffer, 0)
                        if (sampleSize < 0) {
                            decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            decoder.queueInputBuffer(inputIndex, 0, sampleSize, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                // Drain output
                val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, 10_000)
                if (outputIndex >= 0) {
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outputDone = true
                    }
                    if (bufferInfo.size > 0) {
                        val outputBuffer = decoder.getOutputBuffer(outputIndex)!!
                        val shorts = ShortArray(bufferInfo.size / 2)
                        outputBuffer.order(java.nio.ByteOrder.LITTLE_ENDIAN)
                        outputBuffer.asShortBuffer().get(shorts)
                        pcmData.addAll(shorts.toList())
                    }
                    decoder.releaseOutputBuffer(outputIndex, false)
                }
            }

            decoder.stop()
            decoder.release()
            extractor.release()

            // Resample to 16kHz mono if needed
            val targetSampleRate = 16000
            val monoSamples = if (sourceChannels > 1) {
                // Convert stereo to mono by averaging channels
                val mono = mutableListOf<Short>()
                var i = 0
                while (i < pcmData.size - sourceChannels + 1) {
                    var sum = 0L
                    for (ch in 0 until sourceChannels) {
                        sum += pcmData[i + ch].toLong()
                    }
                    mono.add((sum / sourceChannels).toShort())
                    i += sourceChannels
                }
                mono
            } else {
                pcmData
            }

            val resampled = if (sourceSampleRate != targetSampleRate) {
                // Linear interpolation resampling
                val ratio = sourceSampleRate.toDouble() / targetSampleRate
                val outputLength = (monoSamples.size / ratio).toInt()
                val result = ShortArray(outputLength)
                for (i in 0 until outputLength) {
                    val srcPos = i * ratio
                    val srcIndex = srcPos.toInt()
                    val frac = srcPos - srcIndex
                    val s0 = monoSamples[min(srcIndex, monoSamples.size - 1)].toInt()
                    val s1 = monoSamples[min(srcIndex + 1, monoSamples.size - 1)].toInt()
                    result[i] = (s0 + frac * (s1 - s0)).roundToInt().toShort()
                }
                result.toList()
            } else {
                monoSamples
            }

            // Convert Short to Int for React Native bridge (ReadableArray doesn't support Short)
            val intSamples = resampled.map { it.toInt() }

            val durationMs = ((resampled.size.toDouble() / targetSampleRate) * 1000).toLong()

            val result: WritableMap = Arguments.createMap()
            val samplesArray = Arguments.createArray()
            for (sample in intSamples) {
                samplesArray.pushInt(sample)
            }
            result.putArray("samples", samplesArray)
            result.putInt("sampleRate", targetSampleRate)
            result.putLong("durationMs", durationMs)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
        }
    }
}
```

- [ ] **Step 2: Create AudioDecoderPackage.kt**

```kotlin
package com.anythingllm.xberg

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AudioDecoderPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AudioDecoderModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
```

- [ ] **Step 3: Register in XbergPackage.kt**

Read `XbergPackage.kt`, then add `AudioDecoderPackage` to the packages list. The file currently returns `listOf(XbergModule(reactContext))` — add the new package.

- [ ] **Step 4: Build Android to verify compilation**

Run: `cd android && ./gradlew assembleDebug 2>&1 | tail -20`
Expected: BUILD SUCCESSFUL (or at least no compile errors in our new files)

---

### Task 2: iOS AudioDecoderModule

**Files:**
- Create: `ios/AnythingLLM/AudioDecoderModule.swift`
- Create: `ios/AnythingLLM/AudioDecoderModule.m`
- Modify: `ios/AnythingLLM/AnythingLLM-Bridging-Header.h`

**Interfaces:**
- Consumes: file path (String) from JS
- Produces: `{ samples: number[], sampleRate: number, durationMs: number }` via Promise

- [ ] **Step 1: Create AudioDecoderModule.swift**

```swift
import Foundation
import AVFoundation

@objc(AudioDecoderModule)
class AudioDecoderModule: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func decodeToPCM16(_ filePath: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: filePath) else {
            reject("FILE_NOT_FOUND", "File not found: \(filePath)", nil)
            return
        }

        let url = URL(fileURLWithPath: filePath)
        guard let audioFile = try? AVAudioFile(forReading: url) else {
            reject("DECODE_ERROR", "Could not open audio file: \(filePath)", nil)
            return
        }

        let sourceFormat = audioFile.processingFormat
        let sourceSampleRate = Float(sourceFormat.sampleRate)
        let sourceChannels = sourceFormat.channelCount
        let frameLength = AVAudioFramePosition(audioFile.length)

        // Read entire file into buffer
        let buffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: AVAudioFrameCount(frameLength))!
        try? audioFile.read(into: buffer)

        guard let channelData = buffer.floatChannelData else {
            reject("DECODE_ERROR", "No audio data in file", nil)
            return
        }

        // Convert to mono float samples
        let monoFloats: [Float]
        if sourceChannels > 1 {
            monoFloats = (0..<Int(buffer.frameLength)).map { i in
                var sum: Float = 0
                for ch in 0..<sourceChannels {
                    sum += channelData[ch][i]
                }
                return sum / Float(sourceChannels)
            }
        } else {
            monoFloats = Array(UnsafeBufferPointer(start: channelData[0], count: Int(buffer.frameLength)))
        }

        // Resample to 16kHz
        let targetSampleRate: Float = 16000
        let resampled: [Float]
        if sourceSampleRate != targetSampleRate {
            let ratio = Double(sourceSampleRate) / Double(targetSampleRate)
            let outputLength = Int(Double(monoFloats.count) / ratio)
            resampled = (0..<outputLength).map { i in
                let srcPos = Double(i) * ratio
                let srcIndex = Int(srcPos)
                let frac = Float(srcPos - Double(srcIndex))
                let s0 = monoFloats[min(srcIndex, monoFloats.count - 1)]
                let s1 = monoFloats[min(srcIndex + 1, monoFloats.count - 1)]
                return s0 + frac * (s1 - s0)
            }
        } else {
            resampled = monoFloats
        }

        // Convert float [-1.0, 1.0] to Int16
        let int16Samples = resampled.map { sample -> Int in
            let clamped = max(-1.0, min(1.0, sample))
            return Int(clamped * 32767.0)
        }

        let durationMs = Int(Double(resampled.count) / Double(targetSampleRate) * 1000)

        let result: [String: Any] = [
            "samples": int16Samples,
            "sampleRate": Int(targetSampleRate),
            "durationMs": durationMs
        ]
        resolve(result)
    }
}
```

- [ ] **Step 2: Create ObjC bridge AudioDecoderModule.m**

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioDecoderModule, NSObject)

RCT_EXTERN_METHOD(decodeToPCM16:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

- [ ] **Step 3: Add to bridging header**

Read `ios/AnythingLLM/AnythingLLM-Bridging-Header.h` and add:
```objc
#import "AudioDecoderModule.m"
```

- [ ] **Step 4: Build iOS to verify compilation**

Run: `cd ios && xcodebuild -workspace AnythingLLM.xcworkspace -scheme AnythingLLM -sdk iphonesimulator build 2>&1 | tail -20`
Expected: BUILD SUCCEEDED

---

### Task 3: CactusTranscriptionService

**Files:**
- Create: `src/utils/Xberg/CactusTranscriptionService.ts`

**Interfaces:**
- Consumes: `filePath: string`, `modelId?: CactusVoiceModelId`
- Produces: `ExtractionResult` (same shape as XbergClient.transcribeAudio returns)

- [ ] **Step 1: Create CactusTranscriptionService.ts**

```typescript
// CactusTranscriptionService.ts - Transcribe audio files using Cactus Parakeet on Android

import { NativeModules, Platform } from "react-native";
import { CactusSTT } from "cactus-react-native";
import {
  CACTUS_VOICE_MODELS,
  CactusVoiceModelId,
  DEFAULT_CACTUS_ASR_MODEL,
} from "@/utils/models/defaults";
import { ExtractionResult, ExtractionResultItem } from "./types";

const { AudioDecoderModule } = NativeModules;

interface PCMDecodeResult {
  samples: number[];
  sampleRate: number;
  durationMs: number;
}

/**
 * Transcribes an audio file using Cactus Parakeet (on-device ASR).
 *
 * Pipeline: audio file → native PCM16 decode (16kHz mono) → CactusSTT.transcribe()
 *
 * Only used on Android where Xberg Whisper is unavailable. On iOS, prefer
 * XbergClient.transcribeAudio() which uses Whisper.
 */
export class CactusTranscriptionService {
  private static instance: CactusSTT | null = null;
  private static initPromise: Promise<CactusSTT> | null = null;

  /**
   * Lazily initialize and cache a CactusSTT instance with the Parakeet model.
   * The model is already bundled for voice input, so no download step needed.
   */
  private static async getSTT(
    modelId: CactusVoiceModelId = DEFAULT_CACTUS_ASR_MODEL,
  ): Promise<CactusSTT> {
    if (CactusTranscriptionService.instance) {
      return CactusTranscriptionService.instance;
    }
    if (CactusTranscriptionService.initPromise) {
      return CactusTranscriptionService.initPromise;
    }

    CactusTranscriptionService.initPromise = (async () => {
      const bundle = CACTUS_VOICE_MODELS[modelId];
      if (!bundle) throw new Error(`Unknown Cactus voice model: ${modelId}`);

      const stt = new CactusSTT({
        model: bundle.slug,
        options: { quantization: bundle.quantization, pro: bundle.pro },
      });
      await stt.download();
      await stt.init();
      CactusTranscriptionService.instance = stt;
      return stt;
    })();

    try {
      return await CactusTranscriptionService.initPromise;
    } finally {
      CactusTranscriptionService.initPromise = null;
    }
  }

  /**
   * Decode an audio file to PCM16 samples via the native AudioDecoderModule.
   */
  private static async decodeAudio(filePath: string): Promise<PCMDecodeResult> {
    if (!AudioDecoderModule) {
      throw new Error("AudioDecoderModule not available — cannot decode audio on this platform");
    }
    return AudioDecoderModule.decodeToPCM16(filePath);
  }

  /**
   * Transcribe an audio file and return an ExtractionResult matching XbergClient's shape.
   */
  static async transcribe(
    filePath: string,
    modelId: CactusVoiceModelId = DEFAULT_CACTUS_ASR_MODEL,
  ): Promise<ExtractionResult> {
    if (Platform.OS !== "android") {
      throw new Error("CactusTranscriptionService is only supported on Android");
    }

    // 1. Decode audio file to PCM16
    const pcm = await CactusTranscriptionService.decodeAudio(filePath);

    if (!pcm.samples || pcm.samples.length === 0) {
      throw new Error("No audio samples decoded from file");
    }

    // 2. Get or initialize CactusSTT
    const stt = await CactusTranscriptionService.getSTT(modelId);

    // 3. Transcribe
    const transcript = await stt.transcribe({
      audio: pcm.samples,
    });

    // 4. Format as ExtractionResult (matching XbergClient.transcribeAudio shape)
    const item: ExtractionResultItem = {
      content: transcript,
      metadata: {
        format: "audio",
        durationMs: pcm.durationMs,
        sampleRate: pcm.sampleRate,
        engine: "cactus-parakeet",
      },
    };

    return {
      results: [item],
      errors: [],
    };
  }

  /**
   * Clean up the cached STT instance.
   */
  static async destroy(): Promise<void> {
    if (CactusTranscriptionService.instance) {
      await CactusTranscriptionService.instance.destroy();
      CactusTranscriptionService.instance = null;
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn typecheck 2>&1 | tail -30`
Expected: No new errors (pre-existing AudioMemos error is expected)

---

### Task 4: XbergClient Platform Routing

**Files:**
- Modify: `src/utils/Xberg/XbergClient.ts`
- Modify: `src/utils/Xberg/types.ts`

**Interfaces:**
- Consumes: CactusTranscriptionService (from Task 3)
- Produces: Updated `transcribeAudio()` that routes per platform

- [ ] **Step 1: Add TranscriptionEngine type to types.ts**

Read `src/utils/Xberg/types.ts` and add:

```typescript
export type TranscriptionEngine = "whisper" | "cactus-parakeet";
```

- [ ] **Step 2: Update XbergClient.transcribeAudio()**

In `XbergClient.ts`, update the `transcribeAudio` method to route by platform:

```typescript
static async transcribeAudio(
  filePath: string,
  model: TranscriptionConfig["model"] = "tiny",
  language?: string,
): Promise<ExtractionResult> {
  // On Android, use Cactus Parakeet instead of Xberg Whisper
  if (Platform.OS === "android") {
    const { CactusTranscriptionService } = await import("./CactusTranscriptionService");
    return CactusTranscriptionService.transcribe(filePath);
  }

  // On iOS, use Xberg Whisper
  const raw = await requireModule().transcribeAudio(
    filePath,
    model,
    language || null,
  );
  return parseExtractionResult(raw, `transcribeAudio(${filePath})`);
}
```

- [ ] **Step 3: Add getTranscriptionEngine() helper**

Add to `XbergClient`:

```typescript
static getTranscriptionEngine(): TranscriptionEngine {
  return Platform.OS === "android" ? "cactus-parakeet" : "whisper";
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `yarn typecheck 2>&1 | tail -30`
Expected: No new errors

---

### Task 5: TranscriptionOptionsSheet Engine Info

**Files:**
- Modify: `src/screens/WorkspaceChat/PromptInput/Actions/TranscriptionOptionsSheet/index.tsx`

**Interfaces:**
- Consumes: `XbergClient.getTranscriptionEngine()` (from Task 4)
- Produces: Updated UI showing active engine

- [ ] **Step 1: Update TranscriptionOptionsSheet**

Replace the Android warning banner with an engine indicator. The current code shows a red warning when `!transcriptionAvailable`. Replace with a green banner showing the active engine:

```tsx
// Replace the warning section with engine indicator
{transcriptionAvailable ? (
  <View
    style={{ backgroundColor: "rgba(108,233,166,0.15)", padding: 12 }}
    className="rounded-lg flex flex-row items-start gap-3 mb-4">
    <MusicNotes size={18} color="#6CE9A6" style={{ marginTop: 2 }} />
    <View className="flex-1">
      <Text style={{ color: "#6CE9A6" }} className="text-sm font-medium">
        Engine: Xberg Whisper
      </Text>
      <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
        Using ONNX Whisper for high-accuracy transcription.
      </Text>
    </View>
  </View>
) : (
  <View
    style={{ backgroundColor: "rgba(59,130,246,0.15)", padding: 12 }}
    className="rounded-lg flex flex-row items-start gap-3 mb-4">
    <MusicNotes size={18} color="#3B82F6" style={{ marginTop: 2 }} />
    <View className="flex-1">
      <Text style={{ color: "#3B82F6" }} className="text-sm font-medium">
        Engine: Cactus Parakeet
      </Text>
      <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
        Using Parakeet TDT 0.6B for on-device transcription. Model is
        already bundled — no download needed.
      </Text>
    </View>
  </View>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn typecheck 2>&1 | tail -30`
Expected: No new errors

---

## Verification Checklist

After all tasks:

- [ ] Android build succeeds (`./gradlew assembleDebug`)
- [ ] iOS build succeeds (xcodebuild)
- [ ] `yarn typecheck` passes (only pre-existing AudioMemos error)
- [ ] `yarn test` passes
- [ ] On Android: import an audio file → Cactus Parakeet transcribes it
- [ ] On iOS: import an audio file → Xberg Whisper transcribes it (existing behavior)
- [ ] TranscriptionOptionsSheet shows correct engine per platform

## Assumptions

- Parakeet model `parakeet-tdt-0.6b-v3-int4` works for file transcription (not just streaming) — CactusSTT.transcribe() accepts PCM16 samples
- MediaCodec (Android) can decode common audio formats (MP3, M4A, WAV, WebM)
- AVAudioFile (iOS) can read all Xberg-supported audio formats
- Linear interpolation resampling is sufficient quality for speech recognition
- The bridge can handle arrays up to ~100MB (long audio files); may need chunking for files >5 minutes
