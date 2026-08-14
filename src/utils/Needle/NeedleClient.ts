import { CactusLM, type CactusLMTool } from "cactus-react-native";

import type {
  NeedleClient as INeedleClient,
  NeedleRouteDecision,
  RouteOptions,
} from "./types";
import { DOCUMENT_TOOLS } from "./types";

const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export class NeedleClient implements INeedleClient {
  private lm: CactusLM | null = null;

  constructor(private readonly bundlePath: string) {}

  async init(): Promise<void> {
    if (this.lm) {
      return;
    }
    this.lm = new CactusLM({ model: this.bundlePath });
    await this.lm.init();
  }

  async routeRag(
    query: string,
    opts: RouteOptions = {},
  ): Promise<NeedleRouteDecision> {
    if (!this.lm) {
      return { type: "fallback" };
    }

    const confidenceThreshold =
      opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    let result;
    try {
      result = await this.withTimeout(
        this.lm.complete({
          messages: [{ role: "user", content: query }],
          tools: DOCUMENT_TOOLS,
          options: {
            forceTools: true,
            maxTokens: 64,
            confidenceThreshold,
          },
        }),
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    } catch {
      return { type: "fallback" };
    }

    if (
      !result.success ||
      !result.functionCalls?.length ||
      (result.confidence !== undefined &&
        result.confidence < confidenceThreshold)
    ) {
      return { type: "fallback" };
    }

    const call = result.functionCalls[0];
    const maxTopK = opts.maxTopK ?? 2;
    const topK = this.clampTopK(
      Number(call.arguments?.top_k ?? maxTopK),
      maxTopK,
    );

    switch (call.name) {
      case "skip_rag":
        return { type: "skip" };
      case "retrieve_documents":
        return {
          type: "retrieve",
          query: String(call.arguments?.query ?? query),
          topK,
        };
      case "expand_search":
        return {
          type: "expand",
          query: String(call.arguments?.revised_query ?? query),
          topK,
        };
      default:
        return { type: "fallback" };
    }
  }

  async selectTools(
    query: string,
    tools: CactusLMTool[],
    topK = 5,
  ): Promise<CactusLMTool[]> {
    if (!this.lm || tools.length <= topK) {
      return tools;
    }

    const result = await this.withTimeout(
      this.lm.complete({
        messages: [{ role: "user", content: query }],
        tools,
        options: {
          forceTools: true,
          maxTokens: 64,
          toolRagTopK: topK,
        },
      }),
      DEFAULT_TIMEOUT_MS,
    );

    if (!result.success || !result.functionCalls?.length) {
      return tools;
    }

    const selectedNames = new Set(result.functionCalls.map(fc => fc.name));
    return tools.filter(t => selectedNames.has(t.name));
  }

  async destroy(): Promise<void> {
    if (this.lm) {
      await this.lm.destroy();
      this.lm = null;
    }
  }

  private clampTopK(value: number, maxTopK: number): number {
    const parsed = Number.isFinite(value) ? value : maxTopK;
    return Math.max(1, Math.min(Math.round(parsed), Math.min(maxTopK, 5)));
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Needle call timed out")), ms);
    });
    return Promise.race([promise, timeout]);
  }
}
