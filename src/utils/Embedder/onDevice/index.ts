import { EMBEDDING_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import TextSplitter, { TextSplitterConfig } from "@/utils/TextSplitter";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { CactusLM } from "cactus-react-native";
import { EmbeddingProvider, EmbedderPrefixType } from "../types";
import { dedupeChunks } from "@/utils/chunking";

/**
 * The is a known bug with the on device embedder.
 * - When you send a query to the embedder, it will return a vector that is ok.
 * - Sending the EXACT SAME query again will return a different vector.
 * - Sending a different query will return a different vector.
 * - Sending the original query again will return the original vector from the first time.
 * 
 * Seeing this is a known bug with the on device embedder. Not a bug with the model.
 * The likelyhood that the same query is sent twice is very low, but it is something to be aware of.
 * We could track the last query vector and compare it to the new query vector and unload the model if they are different
 * before sending to semantic search, but that is a lot of overhead and we are not sure if it is worth it.
 */
export default class OnDeviceEmbedderProvider implements EmbeddingProvider {
    static instance: OnDeviceEmbedderProvider;

    // cactus-react-native's CactusLM.embed() only exposes a boolean normalize
    // flag (L2/unit-vector normalization), not the llama.cpp p-norm modes.
    private EMBEDDING_NORMALIZE = false;
    private EMBED_PREFIXES: Record<EmbedderPrefixType, string> = {
        query: 'search_query: ',
        embed_document: 'search_document: ',
        classification: 'search_query: ',
        clustering: 'search_query: ',
    };

    private _isWorking: boolean = false;
    private model = EMBEDDING_MODEL.modelId;
    private modelPath = resolveDestinationPathFromGGUFUrl(EMBEDDING_MODEL.tag);
    private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
    private keepAliveInterval = 1000 * (60 * 3); // 3 minutes
    private cactusLmContext: CactusLM | null = null;

    // Singleton, there are no props so nothing to ever reload.
    // Just keep the singleton instance alive.
    constructor() {
        if (!OnDeviceEmbedderProvider.instance) OnDeviceEmbedderProvider.instance = this;
        return OnDeviceEmbedderProvider.instance;
    }

    private log(text: string, ...args: any[]) {
        console.log(`\x1b[35m[OnDeviceEmbedderProvider]\x1b[0m ${text}`, ...args);
    }

    private async downloadModel() {
        try {
            this.log('Downloading embedding model now to save time later...');
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
                fromUrl: EMBEDDING_MODEL.tag,
                toFile: this.modelPath,
                progress: (res) => {
                    const progress = (res.bytesWritten / res.contentLength) * 100;
                    this.log('progress', progress);
                }
            }).promise.then(() => true).catch(() => false);
        } catch (error) {
            this.log('downloadEmbeddingModel:error', error)
            return false;
        }
    }

    private async initialize(): Promise<boolean> {
        try {
            if (!!this.cactusLmContext) return true;
            if (!(await RNFS.exists(this.modelPath))) await this.downloadModel();

            const lm = new CactusLM({ model: this.modelPath });
            await lm.init();
            this.cactusLmContext = lm;
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
        if (this.cactusLmContext) await this.cactusLmContext.destroy();
        this.cactusLmContext = null;
    }

    /**
     * Wraps a function in a keep alive mechanism. that will allow us to keep extending the keep alive timer
     * for as long as any interations are happening.
     * @param func - The function to wrap.
     * @returns The result of the function.
     */
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

    /**
     * Cleans up the embedder.
     */
    async cleanup(): Promise<void> {
        this.log('Cleaning up!');
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
        await this.unloadModel();
    }

    /**
     * Embeds a single text.
     * @param text - The text to embed.
     * @param as - The type of embedding (query, embed_document, classification, clustering)
     * @param dimensions - Optional dimension truncation (Matryoshka)
     * @returns The embedding.
     */
    async embed(text: string, as: EmbedderPrefixType = 'query', dimensions?: number): Promise<number[]> {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.cactusLmContext) throw new Error('OnDeviceEmbedderProvider::embed: could not initialize');

            this.keepAlive();
            const prefix = this.EMBED_PREFIXES[as] || this.EMBED_PREFIXES.query;
            const prefixedText = `${prefix}${text}`;
            this.log(`Embedding text with prefix: ${prefixedText}`);
            const msgResult = await this.cactusLmContext.embed({ text: prefixedText, normalize: this.EMBEDDING_NORMALIZE });

            let embedding = msgResult.embedding;
            if (dimensions && dimensions < embedding.length) {
                embedding = embedding.slice(0, dimensions);
                this.log(`Truncated to ${dimensions} dimensions`);
            }
            return embedding;
        });
    }

    /**
     * Embeds a batch of texts.
     * @param texts - The texts to embed.
     * @param as - The type of embedding
     * @param dimensions - Optional dimension truncation
     */
    async embedBatch(texts: string[], as: EmbedderPrefixType = 'query', dimensions?: number): Promise<number[][]> {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.cactusLmContext) throw new Error('OnDeviceEmbedderProvider::embedBatch: could not initialize');

            const prefix = this.EMBED_PREFIXES[as] || this.EMBED_PREFIXES.query;
            const embeddings: number[][] = [];
            for (const text of texts) {
                const prefixedText = `${prefix}${text}`;
                const msgResult = await this.cactusLmContext.embed({ text: prefixedText, normalize: this.EMBEDDING_NORMALIZE });
                let embedding = msgResult.embedding;
                if (dimensions && dimensions < embedding.length) {
                    embedding = embedding.slice(0, dimensions);
                }
                embeddings.push(embedding);
            }
            return embeddings;
        });
    }

    /**
     * Splits the document text into chunks and embeds them.
     * Returns an array of embeddings with their respective metadata.
     * 
     * Assumes this is a document that is being embedded for semantic search.
     */
    async splitAndEmbed(documentText: string, options: TextSplitterConfig, as: EmbedderPrefixType = 'embed_document'): Promise<{ embedding: number[]; metadata: { content: string } }[]> {
        const textSplitter = new TextSplitter(options);
        let chunks = dedupeChunks(await textSplitter.splitText(documentText));
        this.log(`Split document into ${chunks.length} ~${chunks[0]?.length ?? 0} character chunks`);

        const embeddings = await this.embedBatch(chunks, as);
        return embeddings.map((embedding, index) => ({
            embedding,
            metadata: {
                content: chunks[index]
            }
        }));
    }

    getDimensions(): number {
        return EMBEDDING_MODEL.dimensions || 768;
    }

    getContextLength(): number {
        return EMBEDDING_MODEL.contextLength || 8192;
    }

    getSupportedLanguages(): string[] {
        return EMBEDDING_MODEL.languages || ['en'];
    }

    getModelId(): string {
        return EMBEDDING_MODEL.modelId;
    }

    isInitialized(): boolean {
        return !!this.cactusLmContext;
    }

    touch(): void {
        if (this.cactusLmContext) this.keepAlive();
    }

    supportsMatryoshka(): boolean {
        return false;
    }

    getMatryoshkaDimensions(): number[] {
        return [this.getDimensions()];
    }
}