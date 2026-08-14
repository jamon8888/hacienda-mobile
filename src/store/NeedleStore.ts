import { makeAutoObservable } from "mobx";

import type { CactusLMTool } from "cactus-react-native";

import { NeedleBundleDownloader } from "@/services/downloads/NeedleBundleDownloader";
import {
  NeedleClient,
  type NeedleRouteDecision,
  type RouteOptions,
} from "@/utils/Needle";

export class NeedleStore {
  ready = false;
  busy = false;
  error: string | null = null;
  lastRoute: NeedleRouteDecision | null = null;

  private client: NeedleClient | null = null;
  private downloader = new NeedleBundleDownloader();

  constructor() {
    makeAutoObservable(this);
  }

  async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.ready || this.busy) {
      return;
    }

    this.busy = true;
    this.error = null;

    try {
      const bundlePath = await this.downloader.ensureDownloaded(onProgress);
      this.client = new NeedleClient(bundlePath);
      await this.client.init();
      this.ready = true;
    } catch (err) {
      console.error("[NeedleStore] init failed:", err);
      this.error = err instanceof Error ? err.message : String(err);
      this.ready = false;
      this.client = null;
    } finally {
      this.busy = false;
    }
  }

  async routeRag(
    query: string,
    opts?: RouteOptions,
  ): Promise<NeedleRouteDecision> {
    if (!this.ready || !this.client || this.busy) {
      return { type: "fallback" };
    }

    this.busy = true;
    try {
      const decision = await this.client.routeRag(query, opts);
      this.lastRoute = decision;
      return decision;
    } catch (err) {
      console.error("[NeedleStore] routeRag failed:", err);
      return { type: "fallback" };
    } finally {
      this.busy = false;
    }
  }

  async selectTools(
    query: string,
    tools: CactusLMTool[],
    topK?: number,
  ): Promise<CactusLMTool[]> {
    if (!this.ready || !this.client || this.busy) {
      return tools;
    }

    this.busy = true;
    try {
      return await this.client.selectTools(query, tools, topK);
    } catch (err) {
      console.error("[NeedleStore] selectTools failed:", err);
      return tools;
    } finally {
      this.busy = false;
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    this.ready = false;
  }
}

export default new NeedleStore();
