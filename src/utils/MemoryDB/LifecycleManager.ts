import { getMemoryDB } from './index';

const DECAY_RATE = 0.05;
const IMPORTANCE_THRESHOLD = 0.05;

export async function runMemoryDecay(): Promise<{
  pruned: number;
  decayed: number;
}> {
  const db = getMemoryDB();
  const now = Date.now();

  // 1. Decay importance for unaccessed memories
  const decayResult = await db.executeAsync(
    `UPDATE memories
     SET importance = importance * exp(-? * (? - accessed_at) / (1000 * 60 * 60 * 24))
     WHERE (? - accessed_at) > 7 * 24 * 60 * 60 * 1000`,
    [DECAY_RATE, now, now],
  );

  // 2. Prune memories below threshold
  const pruneResult = await db.executeAsync(
    `DELETE FROM memories WHERE importance < ?`,
    [IMPORTANCE_THRESHOLD],
  );

  // 3. Compact vec index
  await db.executeAsync(`VACUUM`);

  return {
    pruned: pruneResult.rowsAffected || 0,
    decayed: decayResult.rowsAffected || 0,
  };
}

export async function getMemoryStats(
  workspaceId: string,
): Promise<{
  totalMemories: number;
  avgImportance: number;
  oldestMemory: number;
  newestMemory: number;
}> {
  const db = getMemoryDB();
  const result = await db.executeAsync(
    `SELECT
       COUNT(*) as total,
       AVG(importance) as avg_importance,
       MIN(created_at) as oldest,
       MAX(created_at) as newest
     FROM memories
     WHERE workspace_id = ?`,
    [workspaceId],
  );

  const row = result.rows?.[0];
  return {
    totalMemories: row?.total || 0,
    avgImportance: row?.avg_importance || 0,
    oldestMemory: row?.oldest || 0,
    newestMemory: row?.newest || 0,
  };
}
