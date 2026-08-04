import { TextSplitterConfig } from '@/utils/TextSplitter';
import { MultilingualEmbeddingModelId } from '@/utils/models/defaults';

export type EmbedderPrefixType = 'query' | 'embed_document' | 'classification' | 'clustering';

export interface EmbeddingResult {
    embedding: number[];
    metadata: {
        content: string;
    };
}

export interface EmbeddingProvider {
    embed(text: string, as: EmbedderPrefixType, dimensions?: number): Promise<number[]>;
    embedBatch(texts: string[], as: EmbedderPrefixType, dimensions?: number): Promise<number[][]>;
    splitAndEmbed(documentText: string, options: TextSplitterConfig, as: EmbedderPrefixType): Promise<EmbeddingResult[]>;
    getDimensions(): number;
    getContextLength(): number;
    getSupportedLanguages(): string[];
    getModelId(): string;
    cleanup(): Promise<void>;
    isInitialized(): boolean;
}

export type EmbeddingEngine = 'nomic-v1.5' | 'multilingual-e5-small' | 'multilingual-e5-base' | 'sentence-camembert-base' | 'nomic-embed-text-v2-moe' | 'auto';
export type { MultilingualEmbeddingModelId };