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
    /**
     * Extends the keep-alive window if a model context is already loaded. Never triggers a
     * (re)load itself — a no-op when nothing is initialized. Meant to be called from UI signals
     * of active engagement (e.g. typing) so a long pause between messages doesn't tear down the
     * embedder mid-conversation, without eagerly loading a model that RAG may never need.
     */
    touch(): void;
}

export type EmbeddingEngine = 'nomic-v1.5' | 'multilingual-e5-small' | 'multilingual-e5-base' | 'sentence-camembert-base' | 'nomic-embed-text-v2-moe' | 'auto';
export type { MultilingualEmbeddingModelId };