import { NativeModules } from "react-native";
import {
  ExtractionConfig,
  ExtractionResult,
  ExtractionResultItem,
  SupportedFormat,
  TranscriptionConfig,
  SUPPORTED_FILE_TYPES,
} from "./types";

const { XbergModule } = NativeModules;

/** Files per native extractBatch call. See extractBatch() for why this is chunked at all. */
const DEFAULT_BATCH_CHUNK_SIZE = 8;

export type BatchProgress = {
  /** Files whose extraction has been attempted, whether it succeeded or failed. */
  done: number;
  total: number;
};

/**
 * Thrown when XbergModule is absent from NativeModules — i.e. the JS bundle is running against a
 * native build that predates the Xberg module (a stale dev client, or a platform where it was
 * never linked). Callers with a degraded path (plain-text read, remote provider) should catch
 * this specifically rather than treat it as an extraction failure: no amount of retrying, and no
 * different config, will make it succeed.
 */
export class XbergUnavailableError extends Error {
  constructor() {
    super("Xberg native module is not available in this build");
    this.name = "XbergUnavailableError";
  }
}

function requireModule() {
  if (!XbergModule) throw new XbergUnavailableError();
  return XbergModule;
}

function extensionOf(filePath: string): string {
  const base = filePath.split("/").pop() || filePath;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

function hasExtensionIn(
  filePath: string,
  extensions: readonly string[],
): boolean {
  return extensions.includes(extensionOf(filePath));
}

/**
 * Both native modules resolve their extraction promises with a JSON *string* (Kotlin
 * `envelope.toString()` / `result.toJson()`, Swift `resolve(resultJson)`), never a bridged
 * object — React Native hands that through to JS verbatim. Every method below is therefore
 * responsible for parsing before returning anything: `ExtractionResult` is the shape callers are
 * typed against, and reading `.results` off the raw string silently yields `undefined`.
 *
 * Parsing is also the only place the envelope is validated, so a native contract change surfaces
 * here as one explicit error instead of an `undefined` several call frames away.
 */
function parseExtractionResult(
  raw: unknown,
  context: string,
): ExtractionResult {
  if (raw == null)
    throw new Error(`${context}: native module returned no result`);

  let envelope: unknown = raw;
  if (typeof raw === "string") {
    try {
      envelope = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `${context}: native module returned malformed JSON (${
          (e as Error).message
        })`,
      );
    }
  }

  if (typeof envelope !== "object" || envelope === null) {
    throw new Error(
      `${context}: expected an extraction envelope, got ${typeof envelope}`,
    );
  }

  const { results, errors, summary } = envelope as Partial<ExtractionResult>;
  if (results !== undefined && !Array.isArray(results)) {
    throw new Error(`${context}: envelope "results" is not an array`);
  }
  if (errors !== undefined && !Array.isArray(errors)) {
    throw new Error(`${context}: envelope "errors" is not an array`);
  }

  return {
    results: (results ?? []) as ExtractionResultItem[],
    errors: errors ?? [],
    ...(summary !== undefined ? { summary } : {}),
  };
}

function mergeResults(parts: ExtractionResult[]): ExtractionResult {
  return parts.reduce<ExtractionResult>(
    (acc, part) => ({
      results: [...acc.results, ...part.results],
      errors: [...(acc.errors ?? []), ...(part.errors ?? [])],
    }),
    { results: [], errors: [] },
  );
}

export class XbergClient {
  /**
   * Extracts one file, routing by kind:
   *  - audio goes to the transcription path, because Xberg's document extractors produce nothing
   *    usable from an audio container — calling extract() on an .mp3 is always a wasted trip;
   *  - images get `forceOcr` when the caller configured an OCR backend but did not decide for
   *    itself, since an image has no text layer for the non-OCR path to find.
   *
   * A caller that wants the raw native behaviour for a given path can set `forceOcr` explicitly,
   * or call `transcribeAudio` directly.
   */
  static async extract(
    filePath: string,
    config: ExtractionConfig = {},
  ): Promise<ExtractionResult> {
    const module = requireModule();

    if (XbergClient.isAudioFile(filePath)) {
      const { model = "tiny", language } = config.transcription ?? {};
      return XbergClient.transcribeAudio(filePath, model, language);
    }

    const effectiveConfig: ExtractionConfig =
      XbergClient.isImageFile(filePath) &&
      config.ocr &&
      config.forceOcr === undefined
        ? { ...config, forceOcr: true }
        : config;

    const raw = await module.extract(filePath, JSON.stringify(effectiveConfig));
    return parseExtractionResult(raw, `extract(${filePath})`);
  }

  /**
   * Extracts many files, splitting the work across fixed-size native calls.
   *
   * Chunking is not only for progress reporting. The native side can tag results with their
   * source path only when extractBatch returns exactly one result per input (see
   * XbergModule.kt / XbergModule.swift); a single unextractable file breaks that 1:1 match and
   * costs the *whole* batch its source tagging, forcing callers into per-file re-extraction.
   * Capping the chunk size bounds that blast radius to a handful of files rather than an entire
   * folder, and keeps peak native memory proportional to the chunk instead of the folder.
   *
   * Audio files are transcribed one at a time — the native batch path has no transcription mode.
   */
  static async extractBatch(
    filePaths: string[],
    config: ExtractionConfig = {},
    options: {
      chunkSize?: number;
      onProgress?: (progress: BatchProgress) => void;
    } = {},
  ): Promise<ExtractionResult> {
    const module = requireModule();
    if (filePaths.length === 0) return { results: [], errors: [] };

    const chunkSize = Math.max(
      1,
      options.chunkSize ?? DEFAULT_BATCH_CHUNK_SIZE,
    );
    const total = filePaths.length;
    let done = 0;

    const audioPaths = filePaths.filter(XbergClient.isAudioFile);
    const documentPaths = filePaths.filter(p => !XbergClient.isAudioFile(p));
    const parts: ExtractionResult[] = [];

    for (let i = 0; i < documentPaths.length; i += chunkSize) {
      const chunk = documentPaths.slice(i, i + chunkSize);
      try {
        const raw = await module.extractBatch(chunk, JSON.stringify(config));
        parts.push(
          parseExtractionResult(raw, `extractBatch(${chunk.length} files)`),
        );
      } catch (e) {
        // A rejected chunk must not discard the chunks that already succeeded, so the failure is
        // recorded per source path and reported through the same envelope callers already
        // inspect for partial failures.
        const message = e instanceof Error ? e.message : String(e);
        parts.push({
          results: [],
          errors: chunk.map(source => ({
            source,
            error: message,
            code: "BATCH_CHUNK_FAILED",
          })),
        });
      }
      done += chunk.length;
      options.onProgress?.({ done, total });
    }

    for (const filePath of audioPaths) {
      try {
        const { model = "tiny", language } = config.transcription ?? {};
        const transcript = await XbergClient.transcribeAudio(
          filePath,
          model,
          language,
        );
        // transcribeAudio uses the single-file native path, which never tags a source. Callers
        // rely on `source` to map content back to a file, so tag it here.
        parts.push({
          results: transcript.results.map(r => ({
            ...r,
            source: r.source ?? filePath,
          })),
          errors: transcript.errors ?? [],
        });
      } catch (e) {
        parts.push({
          results: [],
          errors: [
            {
              source: filePath,
              error: e instanceof Error ? e.message : String(e),
              code: "TRANSCRIPTION_ERROR",
            },
          ],
        });
      }
      done += 1;
      options.onProgress?.({ done, total });
    }

    return mergeResults(parts);
  }

  /**
   * The extraction settings every ingestion path uses: markdown out (keeps headings and tables
   * as retrievable structure rather than flattening them), OCR available for scanned pages, and
   * semantic chunking sized for the embedding models in `MULTILINGUAL_EMBEDDING_MODELS`.
   *
   * Callers should spread this rather than restate it, so a change to chunk size or OCR backend
   * reaches attachments and folder imports together — they must chunk identically for hash-based
   * skip-on-reimport to stay meaningful across the two paths.
   *
   * Known limitation: `ocr.language` is fixed to English. Tesseract needs per-language trained
   * data bundled in the native package, so widening this depends on what ships in
   * xberg-android/Xberg.xcframework, not on a config change here.
   */
  static defaultExtractionConfig(): ExtractionConfig {
    return {
      outputFormat: "markdown",
      ocr: { backend: "tesseract", language: "eng" },
      chunking: {
        enabled: true,
        strategy: "semantic",
        maxChunkSize: 512,
        chunkOverlap: 50,
      },
    };
  }

  /** `defaultExtractionConfig` plus the native batch tuning used for folder imports. */
  static defaultFolderBatchConfig(): ExtractionConfig {
    return {
      ...XbergClient.defaultExtractionConfig(),
      batch: {
        use_cache: true,
        max_concurrent_extractions: 4,
      },
    };
  }

  static async getSupportedFormats(): Promise<SupportedFormat[]> {
    // Unlike the extraction methods, this one resolves a real bridged array, not a JSON string.
    return requireModule().getSupportedFormats();
  }

  static async transcribeAudio(
    filePath: string,
    model: TranscriptionConfig["model"] = "tiny",
    language?: string,
  ): Promise<ExtractionResult> {
    const raw = await requireModule().transcribeAudio(
      filePath,
      model,
      language || null,
    );
    return parseExtractionResult(raw, `transcribeAudio(${filePath})`);
  }

  static isAvailable(): boolean {
    return !!XbergModule;
  }

  static isAudioFile(filePath: string): boolean {
    return hasExtensionIn(filePath, SUPPORTED_FILE_TYPES.audio);
  }

  static isImageFile(filePath: string): boolean {
    return hasExtensionIn(filePath, SUPPORTED_FILE_TYPES.image);
  }

  static isSupportedFile(filePath: string): boolean {
    return Object.values(SUPPORTED_FILE_TYPES).some(exts =>
      hasExtensionIn(filePath, exts),
    );
  }
}
