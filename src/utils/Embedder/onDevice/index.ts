import {
  EMBEDDING_MODEL,
  CACTUS_EMBEDDING_MODELS,
} from "@/utils/models/defaults";
import TextSplitter, { TextSplitterConfig } from "@/utils/TextSplitter";
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

  private EMBEDDING_NORMALIZE = false;
  private EMBED_PREFIXES: Record<EmbedderPrefixType, string> = {
    query: "search_query: ",
    embed_document: "search_document: ",
    classification: "search_query: ",
    clustering: "search_query: ",
  };

  private _isWorking: boolean = false;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInterval = 1000 * (60 * 3);
  private cactusLmContext: CactusLM | null = null;
  private initPromise: Promise<boolean> | null = null;

  constructor() {
    if (!OnDeviceEmbedderProvider.instance)
      OnDeviceEmbedderProvider.instance = this;
    return OnDeviceEmbedderProvider.instance;
  }

  private log(text: string, ...args: any[]) {
    console.log(`\x1b[35m[OnDeviceEmbedderProvider]\x1b[0m ${text}`, ...args);
  }

  private async initialize(): Promise<boolean> {
    if (!!this.cactusLmContext) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInitialize(): Promise<boolean> {
    try {
      const ref = CACTUS_EMBEDDING_MODELS["nomic-embed-text-v2-moe"];
      this.log(`Initializing model ${ref.slug} (${ref.quantization})`);
      const lm = new CactusLM({
        model: ref.slug,
        options: { quantization: ref.quantization },
      });
      await lm.download();
      await lm.init();
      this.cactusLmContext = lm;
      return true;
    } catch (error) {
      console.error("Failed to initialize model:", error);
      throw error;
    }
  }

  private keepAlive() {
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    this.keepAliveTimer = setTimeout(() => {
      if (!this._isWorking) this.cleanup();
      else {
        this.log("Cannot cleanup, still working...");
        this.keepAliveTimer = setTimeout(
          () => this.keepAlive(),
          this.keepAliveInterval,
        );
      }
    }, this.keepAliveInterval);
  }

  private async unloadModel(): Promise<void> {
    this.log("Unloading model");
    if (this.cactusLmContext) await this.cactusLmContext.destroy();
    this.cactusLmContext = null;
  }

  private async wrapInKeepAlive<T>(func: () => Promise<T>): Promise<T> {
    try {
      this._isWorking = true;
      this.keepAlive();
      return await func();
    } catch (error) {
      this.log("error running function", error);
      throw error;
    } finally {
      this._isWorking = false;
    }
  }

  async cleanup(): Promise<void> {
    this.log("Cleaning up!");
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    await this.unloadModel();
  }

  async embed(
    text: string,
    as: EmbedderPrefixType = "query",
    dimensions?: number,
  ): Promise<number[]> {
    return this.wrapInKeepAlive(async () => {
      await this.initialize();
      if (!this.cactusLmContext)
        throw new Error(
          "OnDeviceEmbedderProvider::embed: could not initialize",
        );

      this.keepAlive();
      const prefix = this.EMBED_PREFIXES[as] || this.EMBED_PREFIXES.query;
      const prefixedText = `${prefix}${text}`;
      this.log(`Embedding text with prefix: ${prefixedText}`);
      const msgResult = await this.cactusLmContext.embed({
        text: prefixedText,
        normalize: this.EMBEDDING_NORMALIZE,
      });

      let embedding = msgResult.embedding;
      if (dimensions && dimensions < embedding.length) {
        embedding = embedding.slice(0, dimensions);
        this.log(`Truncated to ${dimensions} dimensions`);
      }
      return embedding;
    });
  }

  async embedBatch(
    texts: string[],
    as: EmbedderPrefixType = "query",
    dimensions?: number,
  ): Promise<number[][]> {
    return this.wrapInKeepAlive(async () => {
      await this.initialize();
      if (!this.cactusLmContext)
        throw new Error(
          "OnDeviceEmbedderProvider::embedBatch: could not initialize",
        );

      const prefix = this.EMBED_PREFIXES[as] || this.EMBED_PREFIXES.query;
      const embeddings: number[][] = [];
      for (const text of texts) {
        const prefixedText = `${prefix}${text}`;
        const msgResult = await this.cactusLmContext.embed({
          text: prefixedText,
          normalize: this.EMBEDDING_NORMALIZE,
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

  async splitAndEmbed(
    documentText: string,
    options: TextSplitterConfig,
    as: EmbedderPrefixType = "embed_document",
  ): Promise<{ embedding: number[]; metadata: { content: string } }[]> {
    const textSplitter = new TextSplitter({
      ...options,
      chunkSize: Math.min(
        options.chunkSize || 400,
        this.getContextLength() - 50,
      ),
      chunkOverlap: options.chunkOverlap || 50,
    });
    let chunks = dedupeChunks(await textSplitter.splitText(documentText));
    this.log(
      `Split document into ${chunks.length} ~${
        chunks[0]?.length ?? 0
      } character chunks`,
    );

    const embeddings = await this.embedBatch(chunks, as);
    return embeddings.map((embedding, index) => ({
      embedding,
      metadata: {
        content: chunks[index],
      },
    }));
  }

  getDimensions(): number {
    return EMBEDDING_MODEL.dimensions || 768;
  }

  getContextLength(): number {
    return EMBEDDING_MODEL.contextLength || 8192;
  }

  getSupportedLanguages(): string[] {
    return EMBEDDING_MODEL.languages || ["en"];
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