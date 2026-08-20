import { CactusLM, type CactusLMTool } from "cactus-react-native";

import type {
  NeedleClient as INeedleClient,
  NeedleRouteDecision,
  RouteOptions,
} from "./types";
import { DOCUMENT_TOOLS } from "./types";

const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

type CactusCompletionParams = Parameters<
  InstanceType<typeof CactusLM>["complete"]
>[0];

export class NeedleClient implements INeedleClient {
  private lm: CactusLM | null = null;
  // Tracks the real native completion, independent of `withTimeout`'s caller-side race:
  // a timed-out caller stops waiting, but `CactusLM.complete()` keeps running underneath.
  // Refusing new completions (and making destroy() wait) while this is set keeps two
  // completions from ever running concurrently against the same non-reentrant instance.
  private pendingCompletion: Promise<unknown> | null = null;

  constructor(private readonly bundlePath: string) {}

  async init(): Promise<void> {
    if (this.lm) {
      return;
    }
    // Only assign `this.lm` once init() actually succeeds -- otherwise a failed init
    // permanently wedges the client, since the next init() call sees a non-null `lm`
    // and returns early without retrying.
    const lm = new CactusLM({ model: this.bundlePath });
    await lm.init();
    this.lm = lm;
  }

  private runCompletion(
    params: CactusCompletionParams,
  ): ReturnType<InstanceType<typeof CactusLM>["complete"]> {
    const lm = this.lm;
    if (!lm) return Promise.reject(new Error("Needle client not initialized"));
    const completion = lm.complete(params).finally(() => {
      if (this.pendingCompletion === completion) this.pendingCompletion = null;
    });
    this.pendingCompletion = completion;
    return completion;
  }

  async routeRag(
    query: string,
    opts: RouteOptions = {},
  ): Promise<NeedleRouteDecision> {
    if (!this.lm || this.pendingCompletion) {
      return { type: "fallback" };
    }

    const confidenceThreshold =
      opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    let result;
    try {
      result = await this.withTimeout(
        this.runCompletion({
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
    if (!this.lm || tools.length <= topK || this.pendingCompletion) {
      return tools;
    }

    let result;
    try {
      result = await this.withTimeout(
        this.runCompletion({
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
    } catch {
      return tools;
    }

    if (
      !result.success ||
      !result.functionCalls?.length ||
      (result.confidence !== undefined &&
        result.confidence < DEFAULT_CONFIDENCE_THRESHOLD)
    ) {
      return tools;
    }

    const selectedNames = new Set(result.functionCalls.map(fc => fc.name));
    const selected = tools.filter(t => selectedNames.has(t.name));
    // A ranking that names no tool we recognize is a bad ranking, not "select nothing" --
    // keep the caller's original list rather than silently dropping every tool.
    return selected.length > 0 ? selected : tools;
  }

  async destroy(): Promise<void> {
    // Let any in-flight native completion settle before tearing down -- CactusLM's native
    // completion isn't reentrant-safe with destroy() running concurrently underneath it.
    if (this.pendingCompletion) {
      await this.pendingCompletion.catch(() => {});
    }
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
