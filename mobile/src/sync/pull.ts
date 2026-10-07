import type { Db, Row, Tx } from '../db/types';
import { fromRemote } from './codec';
import type { Remote } from './remote';
import { TABLES, TABLE_NAMES, type TableName } from './tables';
import { normalizeTimestamp } from './timestamp';

const PAGE = 500;
// 서버 트랜잭션 커밋 순서와 synced_at 순서가 어긋날 수 있어 커서보다 조금 앞에서부터 다시 받는다.
// 다시 받은 행은 LWW 조건 때문에 변화가 없으므로 안전하다.
const OVERLAP_MS = 60_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

export async function applyRemoteRow(tx: Tx, table: TableName, row: Row): Promise<boolean> {
  const { key, columns } = TABLES[table];
  const cols = columns as readonly string[];
  const updates = cols
    .filter((c) => c !== key)
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const result = await tx.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (${key}) DO UPDATE SET ${updates}
     WHERE excluded.updated_at > ${table}.updated_at`,
    cols.map((c) => row[c] ?? null),
  );
  return result.changes > 0;
}

export async function pull(db: Db, remote: Remote): Promise<boolean> {
  let changed = false;
  for (const table of TABLE_NAMES) {
    const state = await db.getFirstAsync<{ cursor: string }>('SELECT cursor FROM sync_state WHERE table_name = ?', [
      table,
    ]);
    let cursor = state?.cursor ?? null;
    let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : EPOCH;

    for (;;) {
      const rows = await remote.pullSince(table, since, PAGE);
      // 한 페이지를 한 트랜잭션으로 반영한다. 사용자 쓰기와 섞이지 않고, 중간에 실패하면 페이지 전체를 다시 받는다.
      const pageChanged = await db.transaction(async (tx) => {
        let any = false;
        for (const r of rows) {
          if (await applyRemoteRow(tx, table, fromRemote(table, r))) any = true;
        }
        return any;
      });
      if (pageChanged) changed = true;
      if (rows.length > 0) {
        const last = normalizeTimestamp(String(rows[rows.length - 1].synced_at));
        since = last;
        if (!cursor || last > cursor) cursor = last;
      }
      if (rows.length < PAGE) break;
    }

    if (cursor) {
      await db.runAsync(
        `INSERT INTO sync_state (table_name, cursor) VALUES (?, ?)
         ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor`,
        [table, cursor],
      );
    }
  }
  return changed;
}
