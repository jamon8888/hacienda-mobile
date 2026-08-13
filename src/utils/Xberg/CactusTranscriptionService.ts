// CactusTranscriptionService.ts - Transcribe audio files using Cactus Parakeet on Android

import { NativeModules, Platform } from "react-native";
import * as RNFS from "@dr.pogodin/react-native-fs";
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

function mimeTypeFor(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    mpga: "audio/mpeg",
  };
  return map[ext] ?? "audio/unknown";
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
      throw new Error(
        "AudioDecoderModule not available — cannot decode audio on this platform",
      );
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
    const { response } = await stt.transcribe({
      audio: pcm.samples,
    });

    // 4. Resolve file size for the metadata (best-effort; caller may not need it)
    let size = 0;
    try {
      const stat = await RNFS.stat(filePath);
      size = stat.size;
    } catch {
      // stat may fail on certain file URIs; non-fatal
    }

    // 5. Format as ExtractionResult (matching XbergClient.transcribeAudio shape)
    const item: ExtractionResultItem = {
      content: response || "",
      metadata: {
        format: "audio",
        mimeType: mimeTypeFor(filePath),
        size,
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
