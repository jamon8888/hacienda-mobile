import { getMemoryDB } from './index';
import { MemoryRecord } from '../../store/MemoryStore';

export interface SearchOptions {
  workspaceId: string;
  clientId?: string;
  topK?: number;
  vectorWeight?: number;
  bm25Weight?: number;
}

export interface SearchResult {
  memory: MemoryRecord;
  vectorScore: number;
  bm25Score: number;
  finalScore: number;
}

export async function memorySearch(
  query: string,
  queryEmbedding: Float32Array,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const db = getMemoryDB();
  const {
    workspaceId,
    clientId,
    topK = 10,
    vectorWeight = 0.6,
    bm25Weight = 0.4,
  } = options;

  // Step 1: Vector search (top 50)
  const embeddingBlob = Buffer.from(queryEmbedding.buffer);
  const vectorResults = await db.executeAsync(
    `SELECT m.*, v.distance
     FROM memories_vec v
     JOIN memories m ON m.id = v.id
     WHERE v.embedding MATCH ? AND m.workspace_id = ?
     ${clientId ? 'AND m.client_id = ?' : ''}
     ORDER BY v.distance ASC
     LIMIT 50`,
    clientId
      ? [embeddingBlob as any, workspaceId, clientId]
      : [embeddingBlob as any, workspaceId],
  );

  // Step 2: BM25 search (top 20)
  const bm25Results = await db.executeAsync(
    `SELECT m.*, fts.rank
     FROM memories_fts fts
     JOIN memories m ON m.rowid = fts.rowid
     WHERE memories_fts MATCH ? AND m.workspace_id = ?
     ${clientId ? 'AND m.client_id = ?' : ''}
     ORDER BY fts.rank
     LIMIT 20`,
    clientId ? [query, workspaceId, clientId] : [query, workspaceId],
  );

  // Step 3: Merge and deduplicate
  const merged = new Map<
    string,
    { memory: MemoryRecord; vectorScore: number; bm25Score: number }
  >();

  for (const row of vectorResults.rows || []) {
    merged.set(row.id, {
      memory: rowToRecord(row),
      vectorScore: 1 / (1 + (row.distance || 0)),
      bm25Score: 0,
    });
  }

  for (const row of bm25Results.rows || []) {
    const existing = merged.get(row.id);
    if (existing) {
      existing.bm25Score = Math.abs(row.rank || 0);
    } else {
      merged.set(row.id, {
        memory: rowToRecord(row),
        vectorScore: 0,
        bm25Score: Math.abs(row.rank || 0),
      });
    }
  }

  // Step 4: Compute final scores
  const results: SearchResult[] = [];
  for (const [, data] of merged) {
    const freshnessBonus = Math.exp(
      -(Date.now() - data.memory.createdAt) / (1000 * 60 * 60 * 24) * 0.1,
    );
    const structuralPriority = data.memory.kind === 'document' ? 0.15 : 0;
    const importanceBonus = data.memory.importance * 0.1;

    const finalScore =
      data.vectorScore * vectorWeight +
      data.bm25Score * bm25Weight +
      freshnessBonus * 0.1 +
      structuralPriority +
      importanceBonus;

    results.push({
      memory: data.memory,
      vectorScore: data.vectorScore,
      bm25Score: data.bm25Score,
      finalScore,
    });
  }

  // Step 5: Sort and return top K
  results.sort((a, b) => b.finalScore - a.finalScore);
  return results.slice(0, topK);
}

function rowToRecord(row: any): MemoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    content: row.content,
    summary: row.summary,
    sourceUri: row.source_uri,
    sourceType: row.source_type,
    clientId: row.client_id,
    embedding: new Float32Array(row.embedding),
    embeddingModel: row.embedding_model,
    embeddingDims: row.embedding_dims,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accessedAt: row.accessed_at,
    accessCount: row.access_count,
    importance: row.importance,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
