import { makeAutoObservable } from "mobx";
import { XbergClient } from "../utils/Xberg";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";
import { ingestDocument } from "../utils/MemoryDB/IngestPipeline";

export type ProcessingStatus = "idle" | "processing" | "completed" | "error";

export class XbergStore {
  status: ProcessingStatus = "idle";
  progress: number = 0;
  currentFile: string | null = null;
  lastResult: ExtractionResult | null = null;
  error: string | null = null;

  /** Transcription options selected by the user in TranscriptionOptionsSheet */
  transcriptionModel: string = "base";
  transcriptionLanguage: string = "auto";

  constructor() {
    makeAutoObservable(this);
  }

  setTranscriptionOptions(model: string, language: string) {
    this.transcriptionModel = model;
    this.transcriptionLanguage = language;
  }

  async extractFile(
    filePath: string,
    config: ExtractionConfig = {},
    workspaceId?: string,
  ): Promise<ExtractionResult | null> {
    this.status = "processing";
    this.currentFile = filePath;
    this.progress = 0;
    this.error = null;
    try {
      const result = await XbergClient.extract(filePath, config);
      this.lastResult = result;
      this.status = "completed";
      this.progress = 100;

      // Ingest extracted text into memory store
      if (workspaceId && result.results?.length > 0) {
        const fullText = result.results
          .map(r => r.content)
          .filter(Boolean)
          .join("\n\n");
        if (fullText) {
          await ingestDocument(fullText, {
            workspaceId,
            filePath,
            fileType: result.results[0]?.metadata?.format || "unknown",
          });
        }
      }

      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Extraction failed";
      this.status = "error";
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  async extractBatch(
    filePaths: string[],
    config: ExtractionConfig = {},
    workspaceId?: string,
  ): Promise<ExtractionResult | null> {
    this.status = "processing";
    this.progress = 0;
    this.error = null;
    try {
      const result = await XbergClient.extractBatch(filePaths, config);
      this.lastResult = result;
      this.status = "completed";
      this.progress = 100;

      // Ingest extracted text into memory store
      if (workspaceId && result.results?.length > 0) {
        for (const item of result.results) {
          if (item.content) {
            await ingestDocument(item.content, {
              workspaceId,
              filePath: item.source || "unknown",
              fileType: item.metadata?.format || "unknown",
            });
          }
        }
      }

      return result;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Batch extraction failed";
      this.status = "error";
      return null;
    } finally {
      this.currentFile = null;
    }
  }

  reset() {
    this.status = "idle";
    this.progress = 0;
    this.currentFile = null;
    this.lastResult = null;
    this.error = null;
  }
}

export const xbergStore = new XbergStore();
