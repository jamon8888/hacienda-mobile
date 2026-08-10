import { DB, open } from '@op-engineering/op-sqlite';
import { MEMORY_SCHEMA, MEMORY_FTS_SCHEMA, MEMORY_VEC_SCHEMA } from './schema';

let memoryDb: DB | null = null;

export function getMemoryDB(): DB {
  if (!memoryDb) {
    memoryDb = open({ name: 'memory.db' });
  }
  return memoryDb;
}

export async function initMemoryDB(): Promise<DB> {
  const database = getMemoryDB();
  await database.executeAsync(MEMORY_SCHEMA);
  await database.executeAsync(MEMORY_FTS_SCHEMA);
  await database.executeAsync(MEMORY_VEC_SCHEMA);
  return database;
}

export function closeMemoryDB(): void {
  if (memoryDb) {
    memoryDb.close();
    memoryDb = null;
  }
}
