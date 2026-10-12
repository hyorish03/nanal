import type { Db, Row, Tx } from '../db/types';
import { fromRemote } from './codec';
import type { PullCursor, Remote } from './remote';
import { TABLES, TABLE_NAMES, type TableName } from './tables';
import { sortableTimestamp } from './timestamp';

// Supabase 기본 max-rows는 1000이다. pageSize는 서버 상한보다 작아야 한다.
// 아니면 상한에 잘린 페이지가 짧아 보여서 pull이 일찍 멈춘다.
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

const SORTABLE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// 행 자체의 데이터 때문에 생기는 오류만 true. 로컬 제약 위반(CHECK 등)과 시각 파싱 실패가 해당한다.
function isRowDataError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /constraint failed/i.test(message) || message.startsWith('알 수 없는 시각 형식');
}

type StoredCursor = { syncedAt: string; key: string };

function parseStoredCursor(raw: string | undefined): StoredCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value?.syncedAt === 'string' && SORTABLE.test(value.syncedAt) && typeof value?.key === 'string') {
      return value;
    }
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
    let next: PullCursor | null = stored ? { syncedAt: minusOverlap(stored.syncedAt), key: null } : null;

    for (;;) {
      const rows = await remote.pullAfter(table, next, pageSize);
      // 한 페이지를 한 트랜잭션으로 반영한다. 사용자 쓰기와 섞이지 않는다.
      // 데이터 오류로 건너뛴 행은 이후에 다시 시도하지 않는다(커서가 지나가며, 같은 행은 다시 해도 같은 오류이기 때문).
      // 그 외 오류(디스크, 연결 등)는 일시적일 수 있으므로 던져서 페이지를 롤백하고 커서를 옮기지 않는다.
      const pageChanged = await db.transaction(async (tx) => {
        let any = false;
        for (const r of rows) {
          try {
            if (await applyRemoteRow(tx, table, fromRemote(table, r))) any = true;
          } catch (error) {
            if (!isRowDataError(error)) throw error;
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
