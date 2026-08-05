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
  private isProcessing = false;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.setState("initializing");

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
      const asrModel = new CactusSTT({
        model: asrBundle.slug,
        options: { quantization: asrBundle.quantization, pro: asrBundle.pro },
      });
      this.setState("downloading");
      await asrModel.download({
        onProgress: p => this.notifyDownloadProgress("asr", p),
      });
      this.setState("initializing");
      await asrModel.init();
      this.asrModel = asrModel;

      // Load LLM model (Gemma 4 E2B)
      const llmModel = new CactusLM({
        model: llmBundle.slug,
        options: { quantization: llmBundle.quantization, pro: llmBundle.pro },
      });
      this.setState("downloading");
      await llmModel.download({
        onProgress: p => this.notifyDownloadProgress("llm", p),
      });
      this.setState("initializing");
      await llmModel.init();
      this.llmModel = llmModel;

      this.setState("idle");
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  async startListening(): Promise<void> {
    if (this.state === "listening") return;
    if (!this.asrModel || !this.llmModel) {
      await this.initialize();
    }

    this.audioStream = new VoiceAudioStream({
      vadThreshold: this.config.vadThreshold,
    });

    this.audioStream.on("onSpeechSegment", this.handleSpeechSegment.bind(this));
    this.audioStream.on("onError", err => this.notifyError(err));

    await this.audioStream.start();
    this.setState("listening");
  }

  async stopListening(): Promise<void> {
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
    await this.stopListening();
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
      if (this.state !== "error") {
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

  useEffect(() => {
    const unsubState = provider.onStateChange(setState);
    const unsubResponse = provider.onResponse(setLastResponse);
    const unsubTranscript = provider.onTranscript((text, isFinal) =>
      setCurrentTranscript({ text, isFinal }),
    );
    const unsubError = provider.onError(setError);

    return () => {
      unsubState();
      unsubResponse();
      unsubTranscript();
      unsubError();
      provider.cleanup().catch(console.error);
    };
  }, []);

  return {
    provider,
    state,
    lastResponse,
    currentTranscript,
    error,
    initialize: provider.initialize.bind(provider),
    startListening: provider.startListening.bind(provider),
    stopListening: provider.stopListening.bind(provider),
  };
}

import { useState, useEffect } from "react";
