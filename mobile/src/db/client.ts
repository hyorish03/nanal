import { openDatabaseAsync } from 'expo-sqlite';
import { migrate } from './schema';
import { serialize } from './serialize';
import type { Db } from './types';

export async function openDb(): Promise<Db> {
  const db = serialize(await openDatabaseAsync('daily-log.db'));
  await migrate(db);
  return db;
}
