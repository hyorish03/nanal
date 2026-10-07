import { openTestDb } from '../../test/sqlite';
import { migrate } from './schema';

const TS = '2026-10-06T00:00:00.000Z';

test('테이블을 만들고 두 번 실행해도 안전하다', async () => {
  const db = openTestDb();
  await migrate(db);
  await migrate(db);
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    [],
  );
  expect(tables.map((t) => t.name)).toEqual(['days', 'items', 'outbox', 'reflections', 'sync_state']);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
});

test('task는 status가 필요하고, 그 외 종류는 status가 없어야 한다', async () => {
  const db = openTestDb();
  await migrate(db);
  const insert = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, 'x', status, TS, TS],
    );
  await expect(insert('a', 'task', null)).rejects.toThrow();
  await expect(insert('b', 'note', 'open')).rejects.toThrow();
  await expect(insert('c', 'task', 'open')).resolves.toBeDefined();
  await expect(insert('d', 'note', null)).resolves.toBeDefined();
});

test('빈 내용과 범위 밖 기분은 거부한다', async () => {
  const db = openTestDb();
  await migrate(db);
  await expect(
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['a', '2026-10-06', 'note', '   ', null, TS, TS],
    ),
  ).rejects.toThrow();
  await expect(
    db.runAsync('INSERT INTO days (date, mood, updated_at) VALUES (?, ?, ?)', ['2026-10-06', 6, TS]),
  ).rejects.toThrow();
});
