import type { Db } from '../db/types';
import { markDirty } from '../sync/outbox';

export async function setMood(db: Db, date: string, mood: number | null, now = new Date()): Promise<void> {
  if (mood !== null && !(Number.isInteger(mood) && mood >= 1 && mood <= 5)) {
    throw new Error('기분은 1~5 사이 정수여야 합니다');
  }
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO days (date, mood, updated_at, deleted_at) VALUES (?, ?, ?, NULL)
       ON CONFLICT (date) DO UPDATE SET mood = excluded.mood, updated_at = excluded.updated_at, deleted_at = NULL`,
      [date, mood, now.toISOString()],
    );
    await markDirty(tx, 'days', date);
  });
}

export async function getMood(db: Db, date: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ mood: number | null }>(
    'SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL',
    [date],
  );
  return row?.mood ?? null;
}
