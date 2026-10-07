import type { Tx } from '../db/types';
import type { TableName } from './tables';

// 반드시 행을 바꾼 것과 같은 트랜잭션 안에서 호출한다.
export async function markDirty(db: Tx, table: TableName, key: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (table_name, row_key) VALUES (?, ?)
     ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1`,
    [table, key],
  );
}

export async function pendingCount(db: Tx): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', []);
  return row?.n ?? 0;
}
