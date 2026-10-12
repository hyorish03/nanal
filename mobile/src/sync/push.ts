import type { Db, Row } from '../db/types';
import { toRemote } from './codec';
import type { Remote } from './remote';
import { TABLES, TABLE_NAMES } from './tables';

const BATCH = 200;

export async function push(db: Db, remote: Remote): Promise<void> {
  for (const table of TABLE_NAMES) {
    const { key } = TABLES[table];
    for (;;) {
      const entries = await db.getAllAsync<{ row_key: string; version: number }>(
        'SELECT row_key, version FROM outbox WHERE table_name = ? ORDER BY rowid LIMIT ?',
        [table, BATCH],
      );
      if (entries.length === 0) break;

      const placeholders = entries.map(() => '?').join(', ');
      const rows = await db.getAllAsync<Row>(
        `SELECT * FROM ${table} WHERE ${key} IN (${placeholders})`,
        entries.map((e) => e.row_key),
      );
      if (rows.length > 0) await remote.upsert(table, rows.map((r) => toRemote(table, r)));

      // 읽은 뒤에 다시 바뀐 행(version 증가)은 지우지 않아 다음 push에서 다시 보낸다.
      for (const e of entries) {
        await db.runAsync('DELETE FROM outbox WHERE table_name = ? AND row_key = ? AND version = ?', [
          table,
          e.row_key,
          e.version,
        ]);
      }
      if (entries.length < BATCH) break;
    }
  }
}
