import { MULTILINGUAL_EMBEDDING_MODELS, MultilingualEmbeddingModelId } from '@/utils/models/defaults';
import TextSplitter, { TextSplitterConfig } from '@/utils/TextSplitter';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { NativeEmbeddingResult, CactusLM } from 'cactus-react-native';
import { Platform } from 'react-native';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { EmbeddingProvider, EmbedderPrefixType, MultilingualEmbeddingModelId as ModelIdType } from '../types';

const MODEL_PREFIXES: Record<MultilingualEmbeddingModelId, Record<EmbedderPrefixType, string>> = {
    'multilingual-e5-small': {
        query: 'query: ',
        embed_document: 'passage: ',
        classification: 'query: ',
        clustering: 'query: ',
    },
    'multilingual-e5-base': {
        query: 'query: ',
        embed_document: 'passage: ',
        classification: 'query: ',
        clustering: 'query: ',
    },
    'sentence-camembert-base': {
        query: '',
        embed_document: '',
        classification: '',
        clustering: '',
    },
    'nomic-embed-text-v2-moe': {
        query: 'search_query: ',
        embed_document: 'search_document: ',
        classification: 'classification: ',
        clustering: 'clustering: ',
    },
};

const MODEL_NORMALIZATION: Record<MultilingualEmbeddingModelId, number> = {
    'multilingual-e5-small': 2,
    'multilingual-e5-base': 2,
    'sentence-camembert-base': 2,
    'nomic-embed-text-v2-moe': 2,
};

export default class MultilingualEmbedderProvider implements EmbeddingProvider {
    static instances: Map<MultilingualEmbeddingModelId, MultilingualEmbedderProvider> = new Map();

    private modelConfig!: typeof MULTILINGUAL_EMBEDDING_MODELS[MultilingualEmbeddingModelId];
    private EMBED_PREFIXES!: Record<EmbedderPrefixType, string>;
    private EMBEDDING_NORMALIZATION!: number;

    private _isWorking: boolean = false;
    private modelPath!: string;
    private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
    private keepAliveInterval = 1000 * 60 * 3;
    private cactusLmContext: CactusLM | null = null;

    public readonly modelId: MultilingualEmbeddingModelId;

    constructor(modelId: MultilingualEmbeddingModelId) {
        this.modelId = modelId;
        this.modelConfig = MULTILINGUAL_EMBEDDING_MODELS[modelId];
        this.EMBED_PREFIXES = MODEL_PREFIXES[modelId];
        this.EMBEDDING_NORMALIZATION = MODEL_NORMALIZATION[modelId];
        this.modelPath = resolveDestinationPathFromGGUFUrl(this.modelConfig.tag);

        if (!MultilingualEmbedderProvider.instances.has(modelId)) {
            MultilingualEmbedderProvider.instances.set(modelId, this);
        }
        return MultilingualEmbedderProvider.instances.get(modelId)!;
    }

    static getInstance(modelId: MultilingualEmbeddingModelId): MultilingualEmbedderProvider {
        if (!MultilingualEmbedderProvider.instances.has(modelId)) {
            return new MultilingualEmbedderProvider(modelId);
        }
        return MultilingualEmbedderProvider.instances.get(modelId)!;
    }

    private log(text: string, ...args: any[]) {
        console.log(`\x1b[35m[MultilingualEmbedder:${this.modelId}]\x1b[0m ${text}`, ...args);
    }

    private async downloadModel(): Promise<boolean> {
        try {
            this.log('Downloading embedding model...');
            const fileExists = await RNFS.exists(this.modelPath);
            if (fileExists) {
                this.log('Model already exists!');
                return true;
            } else {
                const directory = this.modelPath.split('/').slice(0, -1).join('/');
                this.log('Creating directory', directory);
                await RNFS.mkdir(directory);
            }

            return RNFS.downloadFile({
                fromUrl: this.modelConfig.tag,
                toFile: this.modelPath,
                progress: (res) => {
                    const progress = (res.bytesWritten / res.contentLength) * 100;
                    this.log('progress', progress);
                }
            }).promise.then(() => true).catch((err) => {
                this.log('download error', err);
                return false;
            });
        } catch (error) {
            this.log('downloadEmbeddingModel:error', error);
            return false;
        }
    }

    async initialize(): Promise<boolean> {
        try {
            if (!!this.cactusLmContext) return true;
            if (!(await RNFS.exists(this.modelPath))) {
                const downloaded = await this.downloadModel();
                if (!downloaded) throw new Error('Failed to download model');
            }

            const initConfig = {
                model: this.modelPath,
                n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
                embedding: true,
                n_ctx: this.modelConfig.contextLength,
            };

            this.log(`Initializing with config:`, initConfig);

            const result = await CactusLM.init(initConfig);
            this.cactusLmContext = result.lm;

            this.log(`Initialized successfully with context length ${this.modelConfig.contextLength}`);
            return true;
        } catch (error) {
            console.error('Failed to initialize model:', error);
            throw error;
        }
    }

    private keepAlive() {
        if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
        this.keepAliveTimer = setTimeout(() => {
            if (!this._isWorking) this.cleanup();
            else {
                this.log('Cannot cleanup, still working...');
                this.keepAliveTimer = setTimeout(() => this.keepAlive(), this.keepAliveInterval);
            }
        }, this.keepAliveInterval);
    }

    private async unloadModel(): Promise<void> {
        this.log('Unloading model');
        if (this.cactusLmContext) await this.cactusLmContext.release();
        this.cactusLmContext = null;
    }

    private async wrapInKeepAlive<T>(func: () => Promise<T>): Promise<T> {
        try {
            this._isWorking = true;
            this.keepAlive();
            return await func();
        } catch (error) {
            this.log('error running function', error);
            throw error;
        } finally {
            this._isWorking = false;
        }
    }

    async cleanup(): Promise<void> {
        this.log('Cleaning up!');
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
        await this.unloadModel();
    }

    async embed(text: string, as: EmbedderPrefixType = 'query', dimensions?: number): Promise<number[]> {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.cactusLmContext) throw new Error('MultilingualEmbedderProvider::embed: could not initialize');

            this.keepAlive();
            const prefix = this.EMBED_PREFIXES[as] || '';
            const prefixedText = `${prefix}${text}`;
            this.log(`Embedding (${as}): ${prefixedText.slice(0, 50)}...`);

            const msgResult: NativeEmbeddingResult = await this.cactusLmContext.embedding(prefixedText, {
                embd_normalize: this.EMBEDDING_NORMALIZATION,
            });

            let embedding = msgResult.embedding;
            if (dimensions && dimensions < embedding.length) {
                embedding = embedding.slice(0, dimensions);
                this.log(`Truncated to ${dimensions} dimensions`);
            }
            return embedding;
        });
    }

    async embedBatch(texts: string[], as: EmbedderPrefixType = 'query', dimensions?: number): Promise<number[][]> {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.cactusLmContext) throw new Error('MultilingualEmbedderProvider::embedBatch: could not initialize');

            const prefix = this.EMBED_PREFIXES[as] || '';
            const embeddings: number[][] = [];
            for (const text of texts) {
                const prefixedText = `${prefix}${text}`;
                const msgResult: NativeEmbeddingResult = await this.cactusLmContext.embedding(prefixedText, {
                    embd_normalize: this.EMBEDDING_NORMALIZATION,
                });
                let embedding = msgResult.embedding;
                if (dimensions && dimensions < embedding.length) {
                    embedding = embedding.slice(0, dimensions);
                }
                embeddings.push(embedding);
            }
            return embeddings;
        });
    }

    async splitAndEmbed(documentText: string, options: TextSplitterConfig, as: EmbedderPrefixType = 'embed_document'): Promise<{ embedding: number[]; metadata: { content: string } }[]> {
        const textSplitter = new TextSplitter({
            ...options,
            chunkSize: Math.min(options.chunkSize || 400, this.modelConfig.contextLength - 50),
            chunkOverlap: options.chunkOverlap || 50,
        });

        const chunks = await textSplitter.splitText(documentText);
        this.log(`Split document into ${chunks.length} chunks (max ${this.modelConfig.contextLength} tokens)`);

        const embeddings = await this.embedBatch(chunks, as);
        return embeddings.map((embedding, index) => ({
            embedding,
            metadata: {
                content: chunks[index],
            },
        }));
    }

    getDimensions(): number {
        return this.modelConfig.dimensions;
    }

    getContextLength(): number {
        return this.modelConfig.contextLength;
    }

    getSupportedLanguages(): string[] {
        return [...this.modelConfig.languages];
    }

    getModelId(): string {
        return this.modelConfig.modelId;
    }

    isInitialized(): boolean {
        return !!this.cactusLmContext;
    }

    supportsMatryoshka(): boolean {
        return this.modelId === 'nomic-embed-text-v2-moe';
    }

    getMatryoshkaDimensions(): number[] {
        if (!this.supportsMatryoshka()) return [this.modelConfig.dimensions];
        return [768, 512, 256, 128, 64];
    }
}