import type { Remote, RemoteRow } from '../src/sync/remote';
import { TABLES, type TableName } from '../src/sync/tables';

// 실제 서버처럼 updated_at이 더 오래된 쓰기는 무시하고, 쓸 때마다 synced_at을 찍는다.
export function createFakeRemote() {
  const store: Record<TableName, Map<string, RemoteRow>> = {
    items: new Map(),
    days: new Map(),
    reflections: new Map(),
  };
  const state = { failUpsert: false, upsertCalls: 0 };
  let clock = Date.UTC(2026, 0, 1);

  function write(table: TableName, row: RemoteRow) {
    const key = String(row[TABLES[table].key]);
    const prev = store[table].get(key);
    if (prev && Date.parse(String(row.updated_at)) < Date.parse(String(prev.updated_at))) return;
    clock += 1000;
    store[table].set(key, { ...row, synced_at: new Date(clock).toISOString() });
  }

  const remote: Remote = {
    async upsert(table, rows) {
      state.upsertCalls++;
      if (state.failUpsert) throw new Error('network down');
      for (const row of rows) write(table, row);
    },
    async pullSince(table, since, limit) {
      return [...store[table].values()]
        .filter((r) => String(r.synced_at) > since)
        .sort((a, b) => String(a.synced_at).localeCompare(String(b.synced_at)))
        .slice(0, limit);
    },
  };

  return { remote, store, state, serverWrite: write };
}
