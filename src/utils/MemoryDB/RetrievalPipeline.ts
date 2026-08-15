import { memorySearch, SearchResult } from "./MemorySearch";
import { embedText } from "../Embedder/onDevice/EmbeddingGemmaBridge";

export interface RetrieveOptions {
  workspaceId: string;
  clientId?: string;
  topK?: number;
  useReranker?: boolean;
}

export async function retrieveContext(
  query: string,
  options: RetrieveOptions,
): Promise<SearchResult[]> {
  const { workspaceId, clientId, topK = 5 } = options;

  // 1. Embed query
  const queryEmbedding = await embedText(query);

  // 2. Hybrid search (vector + BM25)
  const results = await memorySearch(query, queryEmbedding, {
    workspaceId,
    clientId,
    topK: 50, // Get more candidates for reranking
  });

  // 3. Return top K
  // Note: Cross-encoder reranking would be added here when available
  return results.slice(0, topK);
}

export function buildContextString(results: SearchResult[]): string {
  return results
    .map(
      r => `[Source: ${r.memory.sourceUri || "unknown"}]: ${r.memory.content}`,
    )
    .join("\n\n");
}
