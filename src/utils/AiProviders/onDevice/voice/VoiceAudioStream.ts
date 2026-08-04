// VoiceAudioStream.ts - TypeScript bridge for native audio recording with VAD

import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';
import { useEffect, useState, useCallback, useRef } from 'react';

const { VoiceAudioModule } = NativeModules;

export interface VoiceAudioConfig {
  sampleRate?: number;
  channels?: number;
  vadThreshold?: number;
  minSpeechDurationMs?: number;
  maxSpeechDurationMs?: number;
  silenceDurationMs?: number;
}

export interface SpeechSegment {
  audioBase64: string;
  isFinal: boolean;
}

export interface VoiceAudioEvents {
  onSpeechSegment: (segment: SpeechSegment) => void;
  onVolumeChange: (volume: number) => void;
  onError: (error: Error) => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
}

class VoiceAudioStream {
  private eventEmitter: NativeEventEmitter | null = null;
  private subscriptions: EmitterSubscription[] = [];
  private config: VoiceAudioConfig;
  private isRecording = false;
  private events: Partial<VoiceAudioEvents> = {};

  constructor(config: VoiceAudioConfig = {}) {
    this.config = {
      sampleRate: 16000,
      channels: 1,
      vadThreshold: 0.5,
      minSpeechDurationMs: 300,
      maxSpeechDurationMs: 30000,
      silenceDurationMs: 800,
      ...config,
    };

    if (Platform.OS === 'ios') {
      this.eventEmitter = new NativeEventEmitter(VoiceAudioModule);
    } else {
      this.eventEmitter = new NativeEventEmitter();
    }
  }

  async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      // Configure VAD
      await VoiceAudioModule.setVADThreshold(this.config.vadThreshold ?? 0.5);
      await VoiceAudioModule.setVADConfig(
        this.config.minSpeechDurationMs ?? 300,
        this.config.maxSpeechDurationMs ?? 30000,
        this.config.silenceDurationMs ?? 800
      );

      // Set up event listeners
      this.setupEventListeners();

      // Start recording
      await VoiceAudioModule.startRecording();
      this.isRecording = true;
      this.events.onRecordingStart?.();
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRecording) return;

    try {
      await VoiceAudioModule.stopRecording();
      this.isRecording = false;
      this.cleanupEventListeners();
      this.events.onRecordingStop?.();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      this.events.onError?.(error as Error);
      throw error;
    }
  }

  private setupEventListeners() {
    if (!this.eventEmitter) return;

    this.subscriptions.push(
      this.eventEmitter.addListener('onSpeechSegment', (event: SpeechSegment) => {
        this.events.onSpeechSegment?.(event);
      })
    );

    this.subscriptions.push(
      this.eventEmitter.addListener('onVolumeChange', (event: { volume: number }) => {
        this.events.onVolumeChange?.(event.volume);
      })
    );
  }

  private cleanupEventListeners() {
    this.subscriptions.forEach(sub => sub.remove());
    this.subscriptions = [];
  }

  on<Event extends keyof VoiceAudioEvents>(
    event: Event,
    callback: VoiceAudioEvents[Event]
  ): () => void {
    this.events[event] = callback;
    return () => {
      this.events[event] = undefined;
    };
  }

  get isActive(): boolean {
    return this.isRecording;
  }
}

/**
 * React hook for VoiceAudioStream
 */
export function useVoiceAudioStream(config: VoiceAudioConfig = {}) {
  const [stream, setStream] = useState<VoiceAudioStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const streamRef = useRef<VoiceAudioStream | null>(null);

  useEffect(() => {
    const newStream = new VoiceAudioStream(config);
    streamRef.current = newStream;
    setStream(newStream);

    const unsubError = newStream.on('onError', (err) => {
      setError(err);
    });

    const unsubVolume = newStream.on('onVolumeChange', (vol) => {
      setVolume(vol);
    });

    const unsubStart = newStream.on('onRecordingStart', () => {
      setIsRecording(true);
    });

    const unsubStop = newStream.on('onRecordingStop', () => {
      setIsRecording(false);
    });

    return () => {
      unsubError();
      unsubVolume();
      unsubStart();
      unsubStop();
      newStream.stop().catch(console.error);
    };
  }, [config]);

  const start = useCallback(async () => {
    if (streamRef.current) {
      setError(null);
      await streamRef.current.start();
    }
  }, []);

  const stop = useCallback(async () => {
    if (streamRef.current) {
      await streamRef.current.stop();
    }
  }, []);

  return {
    stream: streamRef.current,
    isRecording,
    volume,
    error,
    start,
    stop,
  };
}

export { VoiceAudioModule } from 'react-native';

export default VoiceAudioStream;