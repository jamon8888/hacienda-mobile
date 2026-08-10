import { makeAutoObservable } from 'mobx';
import { getMemoryDB } from '../utils/MemoryDB';
import { v4 as uuidv4 } from 'uuid';
import 'react-native-get-random-values';

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  kind: 'conversation' | 'document' | 'note';
  content: string;
  summary?: string;
  sourceUri?: string;
  sourceType?: string;
  clientId?: string;
  embedding: Float32Array;
  embeddingModel: string;
  embeddingDims: number;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  importance: number;
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  constructor() {
    makeAutoObservable(this);
  }

  async insertMemory(
    record: Omit<
      MemoryRecord,
      'id' | 'createdAt' | 'updatedAt' | 'accessedAt' | 'accessCount'
    >,
  ): Promise<string> {
    const db = getMemoryDB();
    const id = uuidv4();
    const now = Date.now();

    const embeddingBlob = Buffer.from(record.embedding.buffer);

    await db.executeAsync(
      `INSERT INTO memories (id, workspace_id, kind, content, summary, source_uri, source_type, client_id, embedding, embedding_model, embedding_dims, created_at, updated_at, accessed_at, access_count, importance, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.workspaceId,
        record.kind,
        record.content,
        record.summary ?? null,
        record.sourceUri ?? null,
        record.sourceType ?? null,
        record.clientId ?? null,
        embeddingBlob as any,
        record.embeddingModel,
        record.embeddingDims,
        now,
        now,
        now,
        0,
        record.importance,
        record.metadata ? JSON.stringify(record.metadata) : null,
      ],
    );

    // Insert into vec index
    await db.executeAsync(
      `INSERT INTO memories_vec (rowid, embedding) VALUES ((SELECT rowid FROM memories WHERE id = ?), ?)`,
      [id, embeddingBlob as any],
    );

    return id;
  }

  async getMemory(id: string): Promise<MemoryRecord | null> {
    const db = getMemoryDB();
    const result = await db.executeAsync(`SELECT * FROM memories WHERE id = ?`, [id]);
    const row = result.rows?.[0];
    if (!row) return null;

    // Update accessed_at
    await db.executeAsync(
      `UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?`,
      [Date.now(), id],
    );

    return this.rowToRecord(row);
  }

  async deleteMemory(id: string): Promise<void> {
    const db = getMemoryDB();
    await db.executeAsync(`DELETE FROM memories WHERE id = ?`, [id]);
  }

  async getMemoriesByWorkspace(workspaceId: string, limit = 100): Promise<MemoryRecord[]> {
    const db = getMemoryDB();
    const result = await db.executeAsync(
      `SELECT * FROM memories WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?`,
      [workspaceId, limit],
    );
    return (result.rows || []).map(this.rowToRecord);
  }

  private rowToRecord(row: any): MemoryRecord {
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
}

export const memoryStore = new MemoryStore();
