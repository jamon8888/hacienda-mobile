import type { SemanticSearchResult } from "@/utils/VectorDB";

// Kept in its own lightweight module (no imports beyond a type) rather than
// inside BaseOpenAILikeProvider so that callers who just need to invalidate
// a workspace's cached results after a vector mutation (embedMemoTranscript,
// useAttachments, IndexingStore) don't have to pull in the whole provider
// class and its heavy dependency chain (ToolsManager, Telemetry, etc).
export const QUERY_CACHE_MAX = 20;
export const queryCache = new Map<string, SemanticSearchResult[]>();

export function queryCacheSet(key: string, results: SemanticSearchResult[]) {
  queryCache.delete(key);
  queryCache.set(key, results);
  if (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
}

/**
 * Drops every cached semantic-search result for a workspace. Call this
 * after mutating that workspace's vectors (new/edited/deleted embeddings)
 * so a stale cache entry from before the mutation can't be served back.
 */
export function invalidateWorkspaceCache(workspaceSlug: string) {
  const prefix = `${workspaceSlug}:`;
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}
