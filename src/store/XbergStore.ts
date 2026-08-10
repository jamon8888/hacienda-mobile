import { makeAutoObservable } from "mobx";
import { XbergClient } from "../utils/Xberg";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";

export type ProcessingStatus = "idle" | "processing" | "completed" | "error";

export class XbergStore {
  status: ProcessingStatus = "idle";
  progress: number = 0;
  currentFile: string | null = null;
  lastResult: ExtractionResult | null = null;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async extractFile(
    filePath: string,
    config: ExtractionConfig = {},
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
  ): Promise<ExtractionResult | null> {
    this.status = "processing";
    this.progress = 0;
    this.error = null;
    try {
      const result = await XbergClient.extractBatch(filePaths, config);
      this.lastResult = result;
      this.status = "completed";
      this.progress = 100;
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
