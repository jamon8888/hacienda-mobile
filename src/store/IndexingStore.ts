import { makeAutoObservable } from "mobx";
import { XbergClient } from "../utils/Xberg";
import { ExtractionConfig, ExtractionResultItem } from "../utils/Xberg/types";
import { getEmbeddingProvider } from "../utils/Embedder";
import { EmbeddingEngine } from "../utils/Embedder/types";
import VectorDB from "../utils/VectorDB";
import Document from "../database/models/Document";
import { storeProcessedFileAsText } from "../utils/fs";
import { getSHA256Hash } from "../utils/device";
import { dedupeChunks } from "../utils/chunking";

export type IndexJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "skipped"
  | "failed";

export type IndexJob = {
  path: string;
  name: string;
  status: IndexJobStatus;
};

/**
 * Which half of the import is running. Extraction happens for the whole batch up front, then
 * embedding runs per file, so a single "done / total" bar would sit still for the entire
 * extraction pass on a large folder. `extracted` tracks the first half, `done` the second.
 */
export type IndexPhase = "idle" | "hashing" | "extracting" | "embedding";

export type IndexProgress = {
  phase: IndexPhase;
  /** Files whose extraction has been attempted. Counts up to `total` during 'extracting'. */
  extracted: number;
  /** Files fully imported, skipped, or failed. Counts up to `total` during 'embedding'. */
  done: number;
  total: number;
  skipped: number;
  failed: number;
  currentFile: string | null;
};

export class IndexingStore {
  isIndexing = false;
  jobs: IndexJob[] = [];
  phase: IndexPhase = "idle";
  extracted = 0;
  done = 0;
  total = 0;
  skipped = 0;
  failed = 0;
  currentFile: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  private setJobStatus(path: string, status: IndexJobStatus) {
    const job = this.jobs.find(j => j.path === path);
    if (job) job.status = status;
  }

  private getProgress(): IndexProgress {
    return {
      phase: this.phase,
      extracted: this.extracted,
      done: this.done,
      total: this.total,
      skipped: this.skipped,
      failed: this.failed,
      currentFile: this.currentFile,
    };
  }

  /**
   * Enqueues a folder import. Runs sequentially off the JS render path;
   * a failure in one file never aborts the rest of the folder.
   */
  async enqueueFolder({
    paths,
    workspaceSlug,
    engine,
    config,
    onProgress,
  }: {
    paths: string[];
    workspaceSlug: string;
    engine: EmbeddingEngine;
    config: ExtractionConfig;
    onProgress?: (progress: IndexProgress) => void;
  }): Promise<{ imported: number; unchanged: number; failed: number }> {
    if (this.isIndexing) return { imported: 0, unchanged: 0, failed: 0 };

    this.isIndexing = true;
    this.jobs = paths.map(path => ({
      path,
      name: path.split("/").pop() || path,
      status: "pending" as IndexJobStatus,
    }));
    this.phase = "hashing";
    this.total = paths.length;
    this.extracted = 0;
    this.done = 0;
    this.skipped = 0;
    this.failed = 0;
    this.currentFile = null;

    const embedder = getEmbeddingProvider(engine);
    let imported = 0;

    try {
      // P2: hash BEFORE extraction — unchanged files are skipped entirely, and never sent
      // to extractBatch below.
      const contentHashByPath = new Map<string, string | null>();
      const toProcess: IndexJob[] = [];
      for (const job of this.jobs) {
        let contentHash: string | null = null;
        try {
          contentHash = await getSHA256Hash(job.path);
        } catch {
          contentHash = null;
        }
        contentHashByPath.set(job.path, contentHash);

        if (contentHash) {
          const existing = await Document.findByContentHash(
            workspaceSlug,
            contentHash,
          );
          if (existing) {
            job.status = "skipped";
            this.skipped += 1;
            this.done += 1;
            onProgress?.(this.getProgress());
            continue;
          }
        }
        toProcess.push(job);
      }

      // P1: extract through the batched native path (parallel + cached natively) instead of one
      // XbergClient.extract() round-trip per file. XbergClient splits this across several native
      // calls internally, so the extraction phase reports its own progress before the per-file
      // embedding loop below starts.
      const resultByPath = new Map<string, ExtractionResultItem>();
      const errorByPath = new Map<string, string>();
      if (toProcess.length > 0) {
        toProcess.forEach(job => {
          this.setJobStatus(job.path, "processing");
        });
        this.phase = "extracting";
        this.extracted = 0;
        onProgress?.(this.getProgress());

        try {
          const batch = await XbergClient.extractBatch(
            toProcess.map(j => j.path),
            config,
            {
              onProgress: ({ done }) => {
                this.extracted = done;
                onProgress?.(this.getProgress());
              },
            },
          );

          // A result is only usable if we know which file it came from: the native side tags
          // `source` when extractBatch returned 1:1 with its inputs, and drops the tag entirely
          // when it did not (see XbergModule.kt/.swift). Untagged results are discarded rather
          // than position-guessed — attributing one file's content to another file's name is a
          // silent, permanent data error, whereas a discarded result just costs one re-extract.
          for (const res of batch.results) {
            if (typeof res.source === "string")
              resultByPath.set(res.source, res);
          }
          for (const err of batch.errors ?? []) {
            if (err.source)
              errorByPath.set(
                err.source,
                err.error || err.code || "Extraction failed",
              );
          }

          // Anything the batch could neither extract nor explain — untagged results, or files
          // the native side silently dropped — is retried individually, where the result needs
          // no source tag to be unambiguous.
          const unresolved = toProcess.filter(
            job => !resultByPath.has(job.path) && !errorByPath.has(job.path),
          );
          if (unresolved.length > 0) {
            console.warn(
              `extractBatch left ${unresolved.length} file(s) unmapped; re-extracting those individually`,
            );
            for (const job of unresolved) {
              // `extracted` is not advanced here: the batch pass already counted these files as
              // attempted, so counting the retry too would push the extraction bar past its own
              // total. The retry is surfaced through `currentFile` instead.
              this.currentFile = job.name;
              onProgress?.(this.getProgress());
              try {
                const single = await XbergClient.extract(job.path, config);
                const res = single.results[0];
                if (res?.content) resultByPath.set(job.path, res);
                else
                  errorByPath.set(job.path, "Extraction returned no content");
              } catch (e) {
                errorByPath.set(
                  job.path,
                  e instanceof Error ? e.message : String(e),
                );
              }
            }
            this.currentFile = null;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          for (const job of toProcess) errorByPath.set(job.path, message);
        }
      }

      this.phase = "embedding";
      onProgress?.(this.getProgress());

      // Embedding + vector storage stay per-file — that's still the part with meaningful
      // per-file latency, so progress reporting here remains granular.
      for (const job of toProcess) {
        this.currentFile = job.name;
        onProgress?.(this.getProgress());

        try {
          const failure = errorByPath.get(job.path);
          if (failure) throw new Error(failure);

          const res = resultByPath.get(job.path);
          if (!res?.content) throw new Error("Extraction returned no content");

          const name = job.name;
          const chunks = res.chunks?.length
            ? res.chunks
            : [{ content: res.content }];
          const chunkContents = dedupeChunks(
            chunks.map(c => c.content).filter(Boolean),
          );
          if (chunkContents.length === 0)
            throw new Error("Extraction produced no chunks");

          await storeProcessedFileAsText(name, res.content);
          const embeddings = await embedder.embedBatch(
            chunkContents,
            "embed_document",
          );
          const { ids } = await VectorDB.bulkInsert(
            workspaceSlug,
            embeddings.map((emb, j) => ({
              embedding: emb,
              metadata: { content: chunkContents[j], name },
            })),
          );
          await Document.create({
            name,
            workspaceSlug,
            vectorBoxIds: ids,
            contentHash: contentHashByPath.get(job.path) ?? null,
          });

          job.status = "completed";
          imported += 1;
        } catch (e) {
          console.error("Failed to process folder file:", job.path, e);
          job.status = "failed";
          this.failed += 1;
        }

        this.done += 1;
        this.currentFile = null;
        onProgress?.(this.getProgress());
      }

      return { imported, unchanged: this.skipped, failed: this.failed };
    } finally {
      this.isIndexing = false;
      this.phase = "idle";
      this.currentFile = null;
    }
  }

  reset() {
    this.isIndexing = false;
    this.jobs = [];
    this.phase = "idle";
    this.extracted = 0;
    this.done = 0;
    this.total = 0;
    this.skipped = 0;
    this.failed = 0;
    this.currentFile = null;
  }
}

export const indexingStore = new IndexingStore();
