import { NativeModules } from 'react-native';
import { ExtractionConfig, ExtractionResult, SupportedFormat } from './types';

const { XbergModule } = NativeModules;

export class XbergClient {
  static async extract(filePath: string, config: ExtractionConfig = {}): Promise<ExtractionResult> {
    return XbergModule.extract(filePath, JSON.stringify(config));
  }

  static async extractBatch(filePaths: string[], config: ExtractionConfig = {}): Promise<ExtractionResult> {
    return XbergModule.extractBatch(filePaths, JSON.stringify(config));
  }

  static defaultFolderBatchConfig(): ExtractionConfig {
    return {
      batch: {
        use_cache: true,
        max_concurrent_extractions: 4,
      },
    };
  }

  static async getSupportedFormats(): Promise<SupportedFormat[]> {
    return XbergModule.getSupportedFormats();
  }

  static async transcribeAudio(filePath: string, model: string = 'tiny', language?: string): Promise<ExtractionResult> {
    return XbergModule.transcribeAudio(filePath, model, language || null);
  }

  static isAudioFile(filePath: string): boolean {
    return ['.mp3', '.m4a', '.wav', '.webm', '.mpga'].some(ext => filePath.toLowerCase().endsWith(ext));
  }

  static isImageFile(filePath: string): boolean {
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'].some(ext => filePath.toLowerCase().endsWith(ext));
  }
}
