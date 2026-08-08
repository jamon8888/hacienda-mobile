// VoicePipelineProvider.ts - Orchestrates ASR -> LLM -> TTS pipeline

import VoiceAudioStream from "./VoiceAudioStream";
import { pcmBase64ToInt16Samples } from "./audioEncoding";
import { speakText } from "./NativeTTS";
import { CactusLM, CactusSTT } from "cactus-react-native";
import {
  CACTUS_VOICE_MODELS,
  CactusVoiceModelBundle,
  CactusVoiceModelId,
  DEFAULT_CACTUS_ASR_MODEL,
  DEFAULT_CACTUS_LLM_MODEL,
} from "@/utils/models/defaults";

export interface VoicePipelineConfig {
  asrModelId?: CactusVoiceModelId;
  llmModelId?: CactusVoiceModelId;
  confidenceThreshold?: number;
  autoHandoff?: boolean;
  processingDelayMs?: number;
  enableTTS?: boolean;
  vadThreshold?: number;
}

export interface VoiceResponse {
  text: string;
  confidence: number;
  cloudHandoff: boolean;
  thinking?: string;
  metrics: {
    asrLatencyMs: number;
    llmLatencyMs: number;
    totalLatencyMs: number;
    asrModel: string;
    llmModel: string;
  };
}

type PipelineState =
  | "idle"
  | "downloading"
  | "initializing"
  | "listening"
  | "transcribing"
  | "thinking"
  | "responding"
  | "error";

export class VoicePipelineProvider {
  private config: Required<VoicePipelineConfig>;
  private asrModel: CactusSTT | null = null;
  private llmModel: CactusLM | null = null;
  private audioStream: VoiceAudioStream | null = null;
  private state: PipelineState = "idle";
  private stateListeners: ((state: PipelineState) => void)[] = [];
  private downloadProgressListeners: ((info: {
    model: "asr" | "llm";
    progress: number;
  }) => void)[] = [];
  private responseListeners: ((response: VoiceResponse) => void)[] = [];
  private transcriptListeners: ((text: string, isFinal: boolean) => void)[] =
    [];
  private errorListeners: ((error: Error) => void)[] = [];
  private volumeListeners: ((volume: number) => void)[] = [];
  private capturingListeners: ((capturing: boolean) => void)[] = [];
  private isProcessing = false;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  // Guards initialize() against being invoked concurrently -- startListening() calls
  // initialize() whenever a model is missing, and VoiceChatScreen also calls it on mount, so
  // without this two overlapping calls could each construct their own CactusSTT/CactusLM and
  // race writing this.asrModel/this.llmModel, leaking whichever native instance loses the race.
  private initPromise: Promise<void> | null = null;
  // Set by cleanup() before it awaits anything, so a still-in-flight initialize() can tell it
  // was torn down mid-download/init and destroy whatever it just finished loading instead of
  // assigning it to this.asrModel/this.llmModel after cleanup already ran.
  private disposed = false;
  // Set by stopListening(), read in handleSpeechSegment()'s finally block -- without this, a
  // user-initiated stop that lands while a segment is still transcribing/responding gets
  // overwritten back to "listening" by that segment's finally block once it completes, even
  // though stopListening() already tore the audio stream down.
  private stopRequested = false;
  // Tracks the in-flight handleSpeechSegment() call (fired-and-forgotten from the audio
  // stream's onSpeechSegment callback) so cleanup() can await it before destroying
  // asrModel/llmModel -- otherwise a screen unmount mid-segment destroys native models while
  // a transcribe()/complete() call is still in flight against them.
  private processingPromise: Promise<void> | null = null;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<VoicePipelineConfig> = {
    asrModelId: DEFAULT_CACTUS_ASR_MODEL,
    llmModelId: DEFAULT_CACTUS_LLM_MODEL,
    confidenceThreshold: 0.7,
    autoHandoff: true,
    processingDelayMs: 50,
    enableTTS: true,
    vadThreshold: 0.5,
  };

  constructor(config: VoicePipelineConfig = {}) {
    this.config = { ...VoicePipelineProvider.DEFAULT_CONFIG, ...config };
  }

  async initialize(
    asrModelId?: CactusVoiceModelId,
    llmModelId?: CactusVoiceModelId,
  ): Promise<void> {
    // Already loaded -- callers like startListening() call initialize() defensively whenever
    // a model is missing, so a no-op fast path here avoids re-downloading/re-initializing
    // models that are already ready.
    if (this.asrModel && this.llmModel) return;
    // Single-flight: share the in-flight promise instead of letting a second caller (e.g.
    // startListening() firing while VoiceChatScreen's mount effect is still awaiting the first
    // call) start a second, independent download/init that races the first to assign
    // this.asrModel/this.llmModel.
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize(asrModelId, llmModelId).finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInitialize(
    asrModelId?: CactusVoiceModelId,
    llmModelId?: CactusVoiceModelId,
  ): Promise<void> {
    if (this.disposed) throw new Error("Voice pipeline was disposed");
    this.setState("initializing");

    // Track instances locally until both are fully loaded -- on partial failure (e.g. ASR
    // succeeds but the LLM download fails) this lets the catch block destroy whatever was
    // already created instead of leaking it, and this.asrModel/this.llmModel are only assigned
    // once the whole pair succeeds so a failed initialize() never leaves the provider in a
    // half-ready state that isReady() would misreport.
    let asrModel: CactusSTT | null = null;
    let llmModel: CactusLM | null = null;

    try {
      const asrId = asrModelId || this.config.asrModelId;
      const llmId = llmModelId || this.config.llmModelId;
      // Widened to the full interface: CACTUS_VOICE_MODELS is `as const satisfies
      // Record<...>`, so each literal's inferred type only has the keys it actually sets --
      // none set the optional `pro`, so TS narrows it out entirely even though every bundle
      // is a valid CactusVoiceModelBundle at runtime.
      const asrBundle: CactusVoiceModelBundle | undefined =
        CACTUS_VOICE_MODELS[asrId];
      const llmBundle: CactusVoiceModelBundle | undefined =
        CACTUS_VOICE_MODELS[llmId];
      // asrId/llmId can come from persisted voice settings (see VoiceSettings.tsx), which may
      // reference a model id from a previous catalog that no longer exists here.
      if (!asrBundle) throw new Error(`Unknown ASR model id: ${asrId}`);
      if (!llmBundle) throw new Error(`Unknown LLM model id: ${llmId}`);

      // Load ASR model (Parakeet)
      asrModel = new CactusSTT({
        model: asrBundle.slug,
        options: { quantization: asrBundle.quantization, pro: asrBundle.pro },
      });
      this.setState("downloading");
      await asrModel.download({
        onProgress: p => this.notifyDownloadProgress("asr", p),
      });
      this.setState("initializing");
      await asrModel.init();
      if (this.disposed) throw new Error("Voice pipeline was disposed");

      // Load LLM model (Gemma 4 E2B)
      llmModel = new CactusLM({
        model: llmBundle.slug,
        options: { quantization: llmBundle.quantization, pro: llmBundle.pro },
      });
      this.setState("downloading");
      await llmModel.download({
        onProgress: p => this.notifyDownloadProgress("llm", p),
      });
      this.setState("initializing");
      await llmModel.init();
      if (this.disposed) throw new Error("Voice pipeline was disposed");

      this.asrModel = asrModel;
      this.llmModel = llmModel;
      this.setState("idle");
    } catch (error) {
      // Destroy whatever got loaded before the failure (or before cleanup() disposed this
      // provider mid-flight) rather than leaking it -- neither instance was assigned to
      // this.asrModel/this.llmModel yet, so cleanup() wouldn't otherwise know about them.
      await asrModel?.destroy().catch(console.error);
      await llmModel?.destroy().catch(console.error);
      this.setState("error");
      throw error;
    }
  }

  async startListening(): Promise<void> {
    // Guard on the stream itself, not just "listening" state -- during transcribing/
    // thinking/responding the stream is still active, and state === "listening" alone
    // would miss those, letting a second call construct and leak a second VoiceAudioStream.
    if (this.audioStream) return;
    if (!this.asrModel || !this.llmModel) {
      await this.initialize();
    }

    this.stopRequested = false;
    const audioStream = new VoiceAudioStream({
      vadThreshold: this.config.vadThreshold,
    });
    // This is the pipeline's one and only capture session -- callers that also want live
    // volume/recording state (e.g. VoiceChatScreen's waveform) subscribe via onVolumeChange/
    // onCapturingChange below instead of creating their own VoiceAudioStream. Two independent
    // streams both calling the native module's startRecording()/stopRecording() used to race
    // and step on each other (the second start rejected as "ALREADY_RECORDING", or one side's
    // stop tore down the other's still-active capture).
    audioStream.on("onSpeechSegment", segment => {
      // Return the promise (not just fire-and-forget it) so callers driving this handler
      // directly -- e.g. tests invoking it like a plain event callback -- can await the
      // segment finishing, same as when it was handleSpeechSegment.bind(this) directly.
      const promise = this.handleSpeechSegment(segment).finally(() => {
        this.processingPromise = null;
      });
      this.processingPromise = promise;
      return promise;
    });
    audioStream.on("onError", err => this.notifyError(err));
    audioStream.on("onVolumeChange", v => this.notifyVolumeChange(v));
    audioStream.on("onRecordingStart", () => this.notifyCapturing(true));
    audioStream.on("onRecordingStop", () => this.notifyCapturing(false));

    try {
      await audioStream.start();
    } catch (error) {
      // Don't leave a half-started stream assigned -- stopListening() would otherwise try to
      // stop a stream that never actually started recording.
      this.notifyCapturing(false);
      throw error;
    }
    this.audioStream = audioStream;
    this.setState("listening");
  }

  async stopListening(): Promise<void> {
    this.stopRequested = true;
    if (this.audioStream) {
      await this.audioStream.stop();
      this.audioStream = null;
    }
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    this.isProcessing = false;
    this.setState("idle");
  }

  async cleanup(): Promise<void> {
    // Set before awaiting anything so an initialize() still in flight (e.g. mid-download when
    // the screen unmounts) can see it was disposed and destroy the models it just finished
    // loading instead of assigning them to this.asrModel/this.llmModel after cleanup below has
    // already run and returned.
    this.disposed = true;
    await this.stopListening();
    // Let any segment already mid-transcribe/complete finish before destroying the models
    // it's using -- stopListening() only tears the audio stream down, it doesn't cancel
    // handleSpeechSegment() calls already in flight from before it ran.
    if (this.processingPromise) await this.processingPromise.catch(() => {});
    if (this.initPromise) await this.initPromise.catch(() => {});
    if (this.asrModel) {
      await this.asrModel.destroy();
      this.asrModel = null;
    }
    if (this.llmModel) {
      await this.llmModel.destroy();
      this.llmModel = null;
    }
  }

  private async handleSpeechSegment(segment: {
    audioBase64: string;
    isFinal: boolean;
  }) {
    if (!segment.isFinal || this.isProcessing) return;
    if (!this.asrModel || !this.llmModel) return;

    this.isProcessing = true;
    this.setState("transcribing");

    try {
      // Step 1: ASR Transcription
      const asrStart = Date.now();
      const transcriptResult = await this.transcribeAudio(segment.audioBase64);
      const asrLatency = Date.now() - asrStart;

      if (!transcriptResult.text.trim()) return;

      this.notifyTranscript(transcriptResult.text, true);
      this.setState("thinking");

      // Thermal delay
      await this.sleep(this.config.processingDelayMs);

      // Step 2: LLM Response
      const llmStart = Date.now();
      const response = await this.generateResponse(transcriptResult.text);
      const llmLatency = Date.now() - llmStart;

      const voiceResponse: VoiceResponse = {
        text: response.text,
        confidence: response.confidence,
        cloudHandoff: response.cloudHandoff,
        thinking: response.thinking,
        metrics: {
          asrLatencyMs: asrLatency,
          llmLatencyMs: llmLatency,
          totalLatencyMs:
            asrLatency + llmLatency + this.config.processingDelayMs,
          asrModel:
            CACTUS_VOICE_MODELS[this.config.asrModelId]?.name || "Parakeet",
          llmModel:
            CACTUS_VOICE_MODELS[this.config.llmModelId]?.name ||
            "Gemma 4 E2B Hybrid",
        },
      };

      this.notifyResponse(voiceResponse);
      this.setState("responding");

      // TTS if enabled
      if (this.config.enableTTS && response.text) {
        await this.speakResponse(response.text);
      }
    } catch (error) {
      console.error("Voice pipeline error:", error);
      this.notifyError(error as Error);
    } finally {
      this.isProcessing = false;
      // Only restore "listening" if nothing stopped the pipeline while this segment was being
      // processed -- stopListening() already tore the audio stream down and set state to
      // "idle"; without this check, that state got silently overwritten back to "listening"
      // the moment the in-flight segment's ASR/LLM/TTS calls finished, misreporting an active
      // capture session that no longer exists.
      if (this.state !== "error" && !this.stopRequested) {
        this.setState("listening");
      }
    }
  }

  private async transcribeAudio(
    audioBase64: string,
  ): Promise<{ text: string }> {
    const result = await this.asrModel!.transcribe({
      audio: pcmBase64ToInt16Samples(audioBase64),
    });

    return { text: result.response || "" };
  }

  private async generateResponse(transcript: string): Promise<{
    text: string;
    confidence: number;
    cloudHandoff: boolean;
    thinking?: string;
  }> {
    const messages = [
      {
        role: "system" as const,
        content:
          "You are a helpful voice assistant. Respond naturally and concisely.",
      },
      {
        role: "user" as const,
        content: transcript,
      },
    ];

    const result = await this.llmModel!.complete({
      messages,
      options: {
        temperature: this.config.autoHandoff ? 0.1 : 0.7,
        maxTokens: 512,
        confidenceThreshold: this.config.confidenceThreshold,
      },
    });

    return {
      text: result.response || "",
      confidence: result.confidence ?? 1.0,
      cloudHandoff: result.cloudHandoff ?? false,
      thinking: result.thinking,
    };
  }

  private async speakResponse(text: string): Promise<void> {
    await speakText(text);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event subscriptions
  onStateChange(listener: (state: PipelineState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  onDownloadProgress(
    listener: (info: { model: "asr" | "llm"; progress: number }) => void,
  ): () => void {
    this.downloadProgressListeners.push(listener);
    return () => {
      this.downloadProgressListeners = this.downloadProgressListeners.filter(
        l => l !== listener,
      );
    };
  }

  onResponse(listener: (response: VoiceResponse) => void): () => void {
    this.responseListeners.push(listener);
    return () => {
      this.responseListeners = this.responseListeners.filter(
        l => l !== listener,
      );
    };
  }

  onTranscript(listener: (text: string, isFinal: boolean) => void): () => void {
    this.transcriptListeners.push(listener);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter(
        l => l !== listener,
      );
    };
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  onVolumeChange(listener: (volume: number) => void): () => void {
    this.volumeListeners.push(listener);
    return () => {
      this.volumeListeners = this.volumeListeners.filter(l => l !== listener);
    };
  }

  onCapturingChange(listener: (capturing: boolean) => void): () => void {
    this.capturingListeners.push(listener);
    return () => {
      this.capturingListeners = this.capturingListeners.filter(
        l => l !== listener,
      );
    };
  }

  private setState(state: PipelineState) {
    this.state = state;
    this.stateListeners.forEach(l => l(state));
  }

  private notifyDownloadProgress(model: "asr" | "llm", progress: number) {
    this.downloadProgressListeners.forEach(l => l({ model, progress }));
  }

  private notifyResponse(response: VoiceResponse) {
    this.responseListeners.forEach(l => l(response));
  }

  private notifyTranscript(text: string, isFinal: boolean) {
    this.transcriptListeners.forEach(l => l(text, isFinal));
  }

  private notifyError(error: Error) {
    this.errorListeners.forEach(l => l(error));
  }

  private notifyVolumeChange(volume: number) {
    this.volumeListeners.forEach(l => l(volume));
  }

  private notifyCapturing(capturing: boolean) {
    this.capturingListeners.forEach(l => l(capturing));
  }

  getState(): PipelineState {
    return this.state;
  }

  isReady(): boolean {
    return !!this.asrModel && !!this.llmModel;
  }
}

/**
 * React hook for VoicePipelineProvider
 */
export function useVoicePipeline(config: VoicePipelineConfig = {}) {
  const [provider] = useState(() => new VoicePipelineProvider(config));
  const [state, setState] = useState<PipelineState>("idle");
  const [lastResponse, setLastResponse] = useState<VoiceResponse | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState({
    text: "",
    isFinal: false,
  });
  const [error, setError] = useState<Error | null>(null);
  const [volume, setVolume] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const unsubState = provider.onStateChange(setState);
    const unsubResponse = provider.onResponse(setLastResponse);
    const unsubTranscript = provider.onTranscript((text, isFinal) =>
      setCurrentTranscript({ text, isFinal }),
    );
    const unsubError = provider.onError(setError);
    // Consumers that want a live waveform/recording indicator (e.g. VoiceChatScreen) read
    // these instead of creating their own VoiceAudioStream -- the provider's own audioStream
    // (created in startListening()) is the pipeline's single capture session; see the comment
    // there for why a second, independent stream used to break things.
    const unsubVolume = provider.onVolumeChange(setVolume);
    const unsubCapturing = provider.onCapturingChange(setIsRecording);

    return () => {
      unsubState();
      unsubResponse();
      unsubTranscript();
      unsubError();
      unsubVolume();
      unsubCapturing();
      provider.cleanup().catch(console.error);
    };
  }, []);

  // provider.initialize.bind(provider) (etc.) used to run inline in the return statement,
  // producing a brand new function identity every render. Any consumer effect that depends on
  // these (e.g. VoiceChatScreen's "initialize on mount" effect) reran on every render as a
  // result -- harmless if initialize() succeeds and flips a guard flag, but if it rejects (no
  // model downloaded, as on a fresh install) the guard never flips, so the effect calls
  // initialize() again, gets a new function identity again, and loops forever ("Maximum update
  // depth exceeded"). provider itself is stable (lazy useState initializer), so binding through
  // useCallback keyed on it gives every consumer a stable reference across renders.
  const initialize = useCallback(
    (...args: Parameters<typeof provider.initialize>) =>
      provider.initialize(...args),
    [provider],
  );
  const startListening = useCallback(
    (...args: Parameters<typeof provider.startListening>) =>
      provider.startListening(...args),
    [provider],
  );
  const stopListening = useCallback(
    (...args: Parameters<typeof provider.stopListening>) =>
      provider.stopListening(...args),
    [provider],
  );

  return {
    provider,
    state,
    lastResponse,
    currentTranscript,
    error,
    volume,
    isRecording,
    initialize,
    startListening,
    stopListening,
  };
}

import { useState, useEffect, useCallback } from "react";
