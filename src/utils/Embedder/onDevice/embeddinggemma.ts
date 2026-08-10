import {
  EmbeddingProvider,
  EmbeddingResult,
  EmbedderPrefixType,
} from '../types';
import { TextSplitterConfig } from '@/utils/TextSplitter';
import { splitText } from '@/utils/TextSplitter';
import {
  isEmbeddingGemmaAvailable,
  initEmbeddingGemma,
  embedText,
  embedBatch,
} from './EmbeddingGemmaBridge';

export class EmbeddingGemmaProvider implements EmbeddingProvider {
  private static instance: EmbeddingGemmaProvider | null = null;
  private initialized = false;
  private readonly MODEL_ID = 'embeddinggemma-300m-q4_0';
  private readonly DIMENSIONS = 128;
  private readonly CONTEXT_LENGTH = 256;

  static getInstance(): EmbeddingGemmaProvider {
    if (!EmbeddingGemmaProvider.instance) {
      EmbeddingGemmaProvider.instance = new EmbeddingGemmaProvider();
    }
    return EmbeddingGemmaProvider.instance;
  }

  private constructor() {}

  async embed(
    text: string,
    _as: EmbedderPrefixType = 'query',
    dimensions?: number,
  ): Promise<number[]> {
    await this.initialize();
    const dims = dimensions || this.DIMENSIONS;
    const embedding = await embedText(text, dims);
    return Array.from(embedding);
  }

  async embedBatch(
    texts: string[],
    _as: EmbedderPrefixType = 'query',
    dimensions?: number,
  ): Promise<number[][]> {
    await this.initialize();
    const dims = dimensions || this.DIMENSIONS;
    const embeddings = await embedBatch(texts, dims);
    return embeddings.map((e) => Array.from(e));
  }

  async splitAndEmbed(
    documentText: string,
    options: TextSplitterConfig,
    as: EmbedderPrefixType,
  ): Promise<EmbeddingResult[]> {
    const chunks = await splitText(documentText, options);
    const embeddings = await this.embedBatch(
      chunks.map((c) => c.text),
      as,
    );

    return chunks.map((chunk, i) => ({
      embedding: embeddings[i],
      metadata: { content: chunk.text },
    }));
  }

  getDimensions(): number {
    return this.DIMENSIONS;
  }

  getContextLength(): number {
    return this.CONTEXT_LENGTH;
  }

  getSupportedLanguages(): string[] {
    return ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'ko', 'zh'];
  }

  getModelId(): string {
    return this.MODEL_ID;
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  touch(): void {
    // No keep-alive needed for EmbeddingGemma — it's always available via native module
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const available = await isEmbeddingGemmaAvailable();
    if (!available) {
      throw new Error('EmbeddingGemma native module not available');
    }

    await initEmbeddingGemma();
    this.initialized = true;
  }
}

export default EmbeddingGemmaProvider;
