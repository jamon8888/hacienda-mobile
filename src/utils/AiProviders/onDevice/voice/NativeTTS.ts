// NativeTTS.ts - Text-to-Speech native module bridge

import { NativeModules, Platform, NativeEventEmitter, EmitterSubscription } from 'react-native';

const { TextToSpeechModule } = NativeModules;

export interface TTSOptions {
  language?: string; // e.g., 'en-US', 'fr-FR'
  rate?: number; // 0.5 - 2.0
  pitch?: number; // 0.5 - 2.0
  volume?: number; // 0.0 - 1.0
  voice?: string; // Voice identifier
}

export interface TTSVoice {
  identifier: string;
  name: string;
  language: string;
  quality: number;
}

class NativeTTS {
  private eventEmitter: NativeEventEmitter | null = null;
  private subscriptions: EmitterSubscription[] = [];

  constructor() {
    if (Platform.OS === 'ios') {
      this.eventEmitter = new NativeEventEmitter(TextToSpeechModule);
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (!TextToSpeechModule?.speak) {
      console.warn('TextToSpeechModule not available');
      return;
    }

    try {
      await TextToSpeechModule.speak(text, {
        language: options.language || 'en-US',
        rate: options.rate ?? 1.0,
        pitch: options.pitch ?? 1.0,
        volume: options.volume ?? 1.0,
        voice: options.voice,
      });
    } catch (error) {
      console.error('TTS speak error:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!TextToSpeechModule?.stop) return;
    try {
      await TextToSpeechModule.stop();
    } catch (error) {
      console.error('TTS stop error:', error);
    }
  }

  async pause(): Promise<void> {
    if (!TextToSpeechModule?.pause) return;
    try {
      await TextToSpeechModule.pause();
    } catch (error) {
      console.error('TTS pause error:', error);
    }
  }

  async getVoices(): Promise<TTSVoice[]> {
    if (!TextToSpeechModule?.getVoices) return [];
    try {
      return await TextToSpeechModule.getVoices();
    } catch (error) {
      console.error('TTS getVoices error:', error);
      return [];
    }
  }

  async setVoice(voiceId: string): Promise<void> {
    if (!TextToSpeechModule?.setVoice) return;
    try {
      await TextToSpeechModule.setVoice(voiceId);
    } catch (error) {
      console.error('TTS setVoice error:', error);
    }
  }

  on(event: 'start' | 'finish' | 'cancel' | 'error', callback: (data?: any) => void): () => void {
    if (!this.eventEmitter) return () => {};
    
    const subscription = this.eventEmitter.addListener(`onTTS${event.charAt(0).toUpperCase() + event.slice(1)}`, callback);
    this.subscriptions.push(subscription);
    return () => subscription.remove();
  }

  destroy() {
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
  }
}

// Singleton instance
let ttsInstance: NativeTTS | null = null;

export function getTTS(): NativeTTS {
  if (!ttsInstance) {
    ttsInstance = new NativeTTS();
  }
  return ttsInstance;
}

export function speakText(text: string, options?: TTSOptions): Promise<void> {
  return getTTS().speak(text, options);
}

export function stopTTS(): Promise<void> {
  return getTTS().stop();
}

export default NativeTTS;