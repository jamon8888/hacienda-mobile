import { makeAutoObservable, runInAction } from "mobx";
import { makePersistable } from "mobx-persist-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

  // Persisted user/device setting gating the on-device Needle router. Defaults
  // to enabled now that P0 on-device bundle verification has passed via
  // NeedleSpikeView; kept as a real toggle (not a hardcoded constant) so it
  // can be turned off per-device without a code change if a regression shows up.
  routerEnabled = true;

  private client: NeedleClient | null = null;
  private downloader = new NeedleBundleDownloader();

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: "NeedleStore",
      properties: ["routerEnabled"],
      storage: AsyncStorage,
    });
  }

  setRouterEnabled(value: boolean) {
    runInAction(() => {
      this.routerEnabled = value;
    });
  }

  async init(onProgress?: (progress: number) => void): Promise<void> {
    if (this.ready || this.busy) {
      return;
    }

    this.busy = true;
    this.error = null;

    try {
      const bundlePath = await this.downloader.ensureDownloaded(onProgress);
      const client = new NeedleClient(bundlePath);
      await client.init();
      runInAction(() => {
        this.client = client;
        this.ready = true;
      });
    } catch (err) {
      console.error("[NeedleStore] init failed:", err);
      runInAction(() => {
        this.error = err instanceof Error ? err.message : String(err);
        this.ready = false;
        this.client = null;
      });
    } finally {
      runInAction(() => {
        this.busy = false;
      });
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
      runInAction(() => {
        this.lastRoute = decision;
      });
      return decision;
    } catch (err) {
      console.error("[NeedleStore] routeRag failed:", err);
      return { type: "fallback" };
    } finally {
      runInAction(() => {
        this.busy = false;
      });
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
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      runInAction(() => {
        this.client = null;
      });
    }
    runInAction(() => {
      this.ready = false;
    });
  }
}

export default new NeedleStore();
