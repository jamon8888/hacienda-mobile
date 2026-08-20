import type { CactusLMTool } from "cactus-react-native";

export type NeedleRouteType = "retrieve" | "expand" | "skip" | "fallback";

export interface NeedleRouteRetrieve {
  type: "retrieve";
  query: string;
  topK: number;
}

export interface NeedleRouteExpand {
  type: "expand";
  query: string;
  topK: number;
}

export interface NeedleRouteSkip {
  type: "skip";
}

export interface NeedleRouteFallback {
  type: "fallback";
}

export type NeedleRouteDecision =
  | NeedleRouteRetrieve
  | NeedleRouteExpand
  | NeedleRouteSkip
  | NeedleRouteFallback;

export interface RouteOptions {
  maxTopK?: number;
  timeoutMs?: number;
  confidenceThreshold?: number;
}

export interface NeedleToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NeedleClient {
  init(bundlePath: string): Promise<void>;
  routeRag(query: string, opts?: RouteOptions): Promise<NeedleRouteDecision>;
  selectTools(
    query: string,
    tools: CactusLMTool[],
    topK?: number,
  ): Promise<CactusLMTool[]>;
  destroy(): Promise<void>;
}

export const DOCUMENT_TOOLS: CactusLMTool[] = [
  {
    name: "retrieve_documents",
    description: "Pull your workspace documents relevant to the question.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search text to embed and match against.",
        },
        top_k: {
          type: "integer",
          description: "How many document chunks to pull (1-5).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "skip_rag",
    description:
      "No document context is needed; answer from general knowledge.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "expand_search",
    description: "Re-run retrieval with a rewritten query and more chunks.",
    parameters: {
      type: "object",
      properties: {
        revised_query: {
          type: "string",
          description: "Rewritten search query.",
        },
        top_k: { type: "integer", description: "How many chunks to retrieve." },
      },
      required: ["revised_query"],
    },
  },
];
