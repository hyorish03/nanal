import type { Remote, RemoteRow } from '../src/sync/remote';
import { TABLES, TABLE_NAMES, type TableName } from '../src/sync/tables';
import { normalizeTimestamp, sortableTimestamp } from '../src/sync/timestamp';

const BASE_MS = Date.UTC(2026, 0, 1);
// 호출마다 1초 + 123µs씩 흐른다. 값이 호출마다 달라지고 마이크로초 부분도 달라진다.
const TICK_MICROS = 1_000_123;

const pad = (n: number, width: number) => String(n).padStart(width, '0');

// PostgREST처럼 마이크로초와 +00:00 오프셋이 붙은 형식으로 만든다.
function formatSyncedAt(micros: number): string {
  const iso = new Date(BASE_MS + Math.floor(micros / 1_000_000) * 1000).toISOString().slice(0, 19);
  return `${iso}.${pad(micros % 1_000_000, 6)}+00:00`;
}

// 실제 Postgres처럼 한 번의 upsert 호출에 들어온 모든 행에 같은 synced_at을 찍고,
// updated_at이 더 오래된 쓰기는 무시한다.
export function createFakeRemote() {
  const store = Object.fromEntries(TABLE_NAMES.map((t) => [t, new Map<string, RemoteRow>()])) as Record<
    TableName,
    Map<string, RemoteRow>
  >;
  const state = { failUpsert: false, upsertCalls: 0 };
  let clockMicros = 0;

  function writeMany(table: TableName, rows: RemoteRow[]) {
    clockMicros += TICK_MICROS;
    const syncedAt = formatSyncedAt(clockMicros);
    for (const row of rows) {
      const key = String(row[TABLES[table].key]);
      const prev = store[table].get(key);
      if (prev && normalizeTimestamp(String(row.updated_at)) < normalizeTimestamp(String(prev.updated_at))) continue;
      store[table].set(key, { ...row, synced_at: syncedAt });
    }
  }

  const remote: Remote = {
    async upsert(table, rows) {
      state.upsertCalls++;
      if (state.failUpsert) throw new Error('network down');
      writeMany(table, rows);
    },
    async pullAfter(table, cursor, limit) {
      const keyName = TABLES[table].key;
      return [...store[table].values()]
        .map((row) => ({ row, at: sortableTimestamp(String(row.synced_at)), key: String(row[keyName]) }))
        .filter(({ at, key }) => {
          if (!cursor) return true;
          if (at !== cursor.syncedAt) return at > cursor.syncedAt;
          return cursor.key !== null && key > cursor.key;
        })
        .sort((a, b) => (a.at === b.at ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.at < b.at ? -1 : 1))
        .slice(0, limit)
        .map(({ row }) => row);
    },
  };

  return { remote, store, state, serverWrite: (table: TableName, row: RemoteRow) => writeMany(table, [row]) };
}
