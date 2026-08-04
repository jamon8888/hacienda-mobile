// VoicePipelineProvider.ts - Orchestrates ASR -> LLM -> TTS pipeline

import { VoiceAudioStream } from './VoiceAudioStream';
import { CactusLM } from 'cactus-react-native';
import { Platform } from 'react-native';
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import { CACTUS_VOICE_MODELS, CactusVoiceModelId, resolveCactusBundlePath } from '@/utils/models/defaults';
import { getDeviceCapabilities } from '@/utils/device';

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

type PipelineState = 'idle' | 'initializing' | 'listening' | 'transcribing' | 'thinking' | 'responding' | 'error';

export class VoicePipelineProvider {
  private config: Required<VoicePipelineConfig>;
  private asrModel: CactusLM | null = null;
  private llmModel: CactusLM | null = null;
  private audioStream: VoiceAudioStream | null = null;
  private state: PipelineState = 'idle';
  private stateListeners: ((state: PipelineState) => void)[] = [];
  private responseListeners: ((response: VoiceResponse) => void)[] = [];
  private transcriptListeners: ((text: string, isFinal: boolean) => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];
  private isProcessing = false;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<VoicePipelineConfig> = {
    asrModelId: 'parakeet-tdt-0.6b-cq2',
    llmModelId: 'gemma-4-e2b-hybrid-cq2.54',
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
    llmModelId?: CactusVoiceModelId
  ): Promise<void> {
    this.setState('initializing');

    try {
      const asrId = asrModelId || this.config.asrModelId;
      const llmId = llmModelId || this.config.llmModelId;

      // Load ASR model (Parakeet)
      const asrBundlePath = resolveCactusBundlePath(asrId);
      const { lm: asrLM, error: asrError } = await CactusLM.init({
        model: asrBundlePath,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        n_ctx: 512,
        embedding: true,
      });

      if (asrError) throw asrError;
      this.asrModel = asrLM!;

      // Load LLM model (Gemma 4 E2B Hybrid)
      const llmBundlePath = resolveCactusBundlePath(llmId);
      const { lm: llmLM, error: llmError } = await CactusLM.init({
        model: llmBundlePath,
        n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
        n_ctx: 4096,
        embedding: false,
      });

      if (llmError) throw llmError;
      this.llmModel = llmLM!;

      this.setState('idle');
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  async startListening(): Promise<void> {
    if (this.state === 'listening') return;
    if (!this.asrModel || !this.llmModel) {
      await this.initialize();
    }

    this.audioStream = new VoiceAudioStream({
      vadThreshold: this.config.vadThreshold,
    });

    this.audioStream.on('onSpeechSegment', this.handleSpeechSegment.bind(this));
    this.audioStream.on('onError', (err) => this.notifyError(err));

    await this.audioStream.start();
    this.setState('listening');
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
    this.setState('idle');
  }

  async cleanup(): Promise<void> {
    await this.stopListening();
    if (this.asrModel) {
      await this.asrModel.release();
      this.asrModel = null;
    }
    if (this.llmModel) {
      await this.llmModel.release();
      this.llmModel = null;
    }
  }

  private async handleSpeechSegment(segment: { audioBase64: string; isFinal: boolean }) {
    if (!segment.isFinal || this.isProcessing) return;
    if (!this.asrModel || !this.llmModel) return;

    this.isProcessing = true;
    this.setState('transcribing');

    try {
      // Step 1: ASR Transcription
      const asrStart = Date.now();
      const transcriptResult = await this.transcribeAudio(segment.audioBase64);
      const asrLatency = Date.now() - asrStart;

      if (!transcriptResult.text.trim()) return;

      this.notifyTranscript(transcriptResult.text, true);
      this.setState('thinking');

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
          totalLatencyMs: asrLatency + llmLatency + this.config.processingDelayMs,
          asrModel: CACTUS_VOICE_MODELS[this.config.asrModelId]?.name || 'Parakeet',
          llmModel: CACTUS_VOICE_MODELS[this.config.llmModelId]?.name || 'Gemma 4 E2B Hybrid',
        },
      };

      this.notifyResponse(voiceResponse);
      this.setState('responding');

      // TTS if enabled
      if (this.config.enableTTS && response.text) {
        await this.speakResponse(response.text);
      }

    } catch (error) {
      console.error('Voice pipeline error:', error);
      this.notifyError(error as Error);
    } finally {
      this.isProcessing = false;
      if (this.state !== 'error') {
        this.setState('listening');
      }
    }
  }

  private async transcribeAudio(audioBase64: string): Promise<{ text: string }> {
    // For ASR, we use the streaming transcription API
    // This is a placeholder - actual implementation uses Cactus.streamTranscribeStart/Process/Stop
    // For now, we'll use a simple completion with audio in messages
    const result = await this.asrModel!.completion([{
      role: 'user',
      content: 'Transcribe the audio.',
      // Note: audio in messages requires Cactus native support
    }], {
      temperature: 0.0,
      max_tokens: 256,
    });

    return { text: result.content || '' };
  }

  private async generateResponse(transcript: string): Promise<{
    text: string;
    confidence: number;
    cloudHandoff: boolean;
    thinking?: string;
  }> {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful voice assistant. Respond naturally and concisely.',
      },
      {
        role: 'user',
        content: transcript,
      },
    ];

    const result = await this.llmModel!.completion(messages, {
      temperature: this.config.autoHandoff ? 0.1 : 0.7,
      max_tokens: 512,
      // Note: confidence_threshold and auto_handoff are not yet in React Native bindings
    });

    // CactusLM NativeCompletionResult doesn't have confidence/cloud_handoff/thinking yet
    // These will be available when React Native bindings are updated to match Cactus Engine C API
    return {
      text: result.content || '',
      confidence: 1.0, // Placeholder - will be available in future Cactus RN bindings
      cloudHandoff: false, // Placeholder
      thinking: result.reasoning_content || undefined,
    };
  }

  private async speakResponse(text: string): Promise<void> {
    // Native TTS implementation
    if (Platform.OS === 'ios') {
      // Use AVSpeechSynthesizer via native module
      // await NativeModules.TextToSpeech.speak(text);
    } else {
      // Use Android TextToSpeech via native module
      // await NativeModules.TextToSpeech.speak(text);
    }
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

  onResponse(listener: (response: VoiceResponse) => void): () => void {
    this.responseListeners.push(listener);
    return () => {
      this.responseListeners = this.responseListeners.filter(l => l !== listener);
    };
  }

  onTranscript(listener: (text: string, isFinal: boolean) => void): () => void {
    this.transcriptListeners.push(listener);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter(l => l !== listener);
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
  const [state, setState] = useState<'idle' | 'initializing' | 'listening' | 'transcribing' | 'thinking' | 'responding' | 'error'>('idle');
  const [lastResponse, setLastResponse] = useState<VoiceResponse | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState({ text: '', isFinal: false });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubState = provider.onStateChange(setState);
    const unsubResponse = provider.onResponse(setLastResponse);
    const unsubTranscript = provider.onTranscript((text, isFinal) => setCurrentTranscript({ text, isFinal }));
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

import { useState, useEffect } from 'react';