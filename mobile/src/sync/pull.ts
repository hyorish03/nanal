import type { Db, Row, Tx } from '../db/types';
import { fromRemote } from './codec';
import type { PullCursor, Remote } from './remote';
import { TABLES, TABLE_NAMES, type TableName } from './tables';
import { sortableTimestamp } from './timestamp';

const PAGE = 500;
// 서버 트랜잭션 커밋 순서와 synced_at 순서가 어긋날 수 있어 커서보다 조금 앞에서부터 다시 받는다.
// 다시 받은 행은 LWW 조건 때문에 변화가 없으므로 안전하다.
const OVERLAP_MS = 60_000;

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

type StoredCursor = { syncedAt: string; key: string };

function parseStoredCursor(raw: string | undefined): StoredCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value?.syncedAt === 'string' && typeof value?.key === 'string') return value;
  } catch {
    // 형식이 깨졌으면 처음부터 다시 받는다. 반영은 멱등이라 안전하다.
  }
  return null;
}

function isAfter(a: StoredCursor, b: StoredCursor): boolean {
  return a.syncedAt > b.syncedAt || (a.syncedAt === b.syncedAt && a.key > b.key);
}

// sortable 형식(YYYY-MM-DDTHH:MM:SS.ffffffZ)에서 소수부는 그대로 두고 초 단위 이하만 뺀다.
function minusOverlap(sortable: string): string {
  const seconds = Date.parse(`${sortable.slice(0, 19)}Z`) - OVERLAP_MS;
  return `${new Date(seconds).toISOString().slice(0, 19)}${sortable.slice(19)}`;
}

export async function pull(db: Db, remote: Remote, options: { pageSize?: number } = {}): Promise<boolean> {
  const pageSize = options.pageSize ?? PAGE;
  let changed = false;
  for (const table of TABLE_NAMES) {
    const state = await db.getFirstAsync<{ cursor: string }>('SELECT cursor FROM sync_state WHERE table_name = ?', [
      table,
    ]);
    const stored = parseStoredCursor(state?.cursor);
    let saved = stored;
    // 서버 트랜잭션 커밋 순서와 synced_at 순서가 어긋날 수 있어 커서보다 조금 앞에서부터 다시 받는다.
    // 다시 받은 행은 LWW 조건 때문에 변화가 없으므로 안전하다.
    let next: PullCursor | null = stored ? { syncedAt: minusOverlap(stored.syncedAt), key: null } : null;

    for (;;) {
      const rows = await remote.pullAfter(table, next, pageSize);
      // 한 페이지를 한 트랜잭션으로 반영한다. 사용자 쓰기와 섞이지 않는다.
      // 로컬 제약을 어기는 행 하나 때문에 동기화가 멈추지 않도록 그 행만 건너뛴다.
      const pageChanged = await db.transaction(async (tx) => {
        let any = false;
        for (const r of rows) {
          try {
            if (await applyRemoteRow(tx, table, fromRemote(table, r))) any = true;
          } catch (error) {
            console.warn(`pull: ${table} 행을 건너뜀 (key=${String(r[TABLES[table].key])})`, error);
          }
        }
        return any;
      });
      if (pageChanged) changed = true;

      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        const lastCursor: StoredCursor = {
          syncedAt: sortableTimestamp(String(last.synced_at)),
          key: String(last[TABLES[table].key]),
        };
        next = lastCursor;
        // 커서는 뒤로 가지 않는다. 반영이 멱등이므로 페이지마다 저장해도 안전하다.
        if (!saved || isAfter(lastCursor, saved)) {
          saved = lastCursor;
          await db.runAsync(
            `INSERT INTO sync_state (table_name, cursor) VALUES (?, ?)
             ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor`,
            [table, JSON.stringify(saved)],
          );
        }
      }
      if (rows.length < pageSize) break;
    }
  }
  return changed;
}
