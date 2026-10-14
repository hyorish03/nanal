import type { Db, Row } from '../db/types';
import { toRemote } from './codec';
import type { Remote } from './remote';
import { TABLES, TABLE_NAMES, type TableName } from './tables';

const BATCH = 200;

// 표마다 따로 올린다. 한 표가 서버에서 거절되면(예: 서버 마이그레이션 전이라 새 상태값을 모르는 경우)
// 그 표의 outbox는 그대로 남겨 다음 동기화에 다시 보내고, 다른 표는 계속 올린다. 처음 난 오류는 끝에 다시 던진다.
export async function push(db: Db, remote: Remote): Promise<void> {
  let failed: { error: unknown } | null = null;
  for (const table of TABLE_NAMES) {
    try {
      await pushTable(db, remote, table);
    } catch (e) {
      failed ??= { error: e };
    }
  }
  if (failed) throw failed.error;
}

async function pushTable(db: Db, remote: Remote, table: TableName): Promise<void> {
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
