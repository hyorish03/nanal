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
  expect(tables.map((t) => t.name)).toEqual([
    'days', 'items', 'monthly_reviews', 'outbox', 'reflections', 'someday', 'sync_state', 'templates',
  ]);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 7 });
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

const TS2 = '2026-10-06T00:00:00.000Z';

test('v1 데이터를 v2로 옮긴다: 일정은 할 일, 놓아준 일은 삭제 표시', async () => {
  const db = openTestDb();
  await migrate(db, 1);
  const ins = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, id, status, TS2, TS2],
    );
  await ins('ev', 'event', null);
  await ins('dr', 'task', 'dropped');
  await ins('op', 'task', 'open');
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['r1', '2026-10-06', 'perfectionism', '{"want":"x"}', TS2, TS2],
  );

  await migrate(db);

  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 7 });
  expect(await db.getAllAsync('SELECT id, kind, status, priority, deleted_at FROM items ORDER BY id', [])).toEqual([
    { id: 'dr', kind: 'task', status: 'open', priority: 0, deleted_at: TS2 },
    { id: 'ev', kind: 'task', status: 'open', priority: 0, deleted_at: null },
    { id: 'op', kind: 'task', status: 'open', priority: 0, deleted_at: null },
  ]);
  expect(await db.getFirstAsync('SELECT template, snapshot FROM reflections', [])).toEqual({
    template: 'perfectionism',
    snapshot: null,
  });
});

test('v2 제약: 일정·놓아준 일은 거부, 진행 중·사용자 템플릿은 허용', async () => {
  const db = openTestDb();
  await migrate(db, 3); // v4부터는 안 하기(dropped)가 다시 들어온다
  const ins = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, 'x', status, TS2, TS2],
    );
  await expect(ins('a', 'event', null)).rejects.toThrow();
  await expect(ins('b', 'task', 'dropped')).rejects.toThrow();
  await expect(ins('c', 'task', 'doing')).resolves.toBeDefined();
  await expect(
    db.runAsync(
      'INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['r', '2026-10-06', 'tpl-1', '{}', '{"name":"운동한 날","questions":[]}', TS2, TS2],
    ),
  ).resolves.toBeDefined();
  await expect(
    db.runAsync('INSERT INTO templates (id, name, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      't', '  ', '[]', TS2, TS2,
    ]),
  ).rejects.toThrow();
});

test('v3 → v4: items를 새로 만들어도 행·우선순위·삭제 표시·색인이 그대로이고 안 하기를 받는다', async () => {
  const db = openTestDb();
  await migrate(db, 3);
  const cols = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
  const rows = [
    { id: 'a', date: '2026-10-06', kind: 'task', text: '보고서', status: 'doing', priority: 1, migrated_from: null, created_at: TS, updated_at: TS, deleted_at: null },
    { id: 'b', date: '2026-10-07', kind: 'task', text: '장보기', status: 'open', priority: 0, migrated_from: 'x', created_at: TS, updated_at: TS, deleted_at: null },
    { id: 'c', date: '2026-10-06', kind: 'note', text: '비', status: null, priority: 0, migrated_from: null, created_at: TS, updated_at: TS, deleted_at: TS },
  ];
  for (const r of rows) {
    await db.runAsync(`INSERT INTO items (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(r));
  }
  await db.runAsync("INSERT INTO outbox (table_name, row_key) VALUES ('items', 'a')", []);

  await migrate(db, 4);

  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 4 });
  expect(await db.getAllAsync(`SELECT ${cols} FROM items ORDER BY id`, [])).toEqual(rows);
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'items'", [])).toEqual([{ row_key: 'a' }]);
  const indexes = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'items' AND name NOT LIKE 'sqlite_%'", []);
  expect(indexes.map((i) => i.name)).toEqual(['items_date']);

  const ins = (id: string, kind: string, status: string | null) =>
    db.runAsync('INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id, '2026-10-06', kind, 'x', status, TS, TS,
    ]);
  await expect(ins('d', 'task', 'dropped')).resolves.toBeDefined();
  await expect(ins('e', 'task', 'gone')).rejects.toThrow();
  await expect(ins('f', 'note', 'dropped')).rejects.toThrow();
  await expect(ins('g', 'event', null)).rejects.toThrow();
});

test('v4 → v5: 언젠가 표를 더해도 기존 기록·outbox·동기화 위치가 그대로이고, 언젠가 제약을 지킨다', async () => {
  const db = openTestDb();
  await migrate(db, 4);
  const cols = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
  const item = { id: 'a', date: '2026-10-06', kind: 'task', text: '보고서', status: 'dropped', priority: 1, migrated_from: null, created_at: TS, updated_at: TS, deleted_at: null };
  await db.runAsync(`INSERT INTO items (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(item));
  await db.runAsync('INSERT INTO days (date, mood, updated_at) VALUES (?, ?, ?)', ['2026-10-06', 4, TS]);
  await db.runAsync("INSERT INTO outbox (table_name, row_key) VALUES ('items', 'a')", []);
  await db.runAsync("INSERT INTO sync_state (table_name, cursor) VALUES ('owner', 'u1')", []);

  await migrate(db, 5);

  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
  expect(await db.getAllAsync(`SELECT ${cols} FROM items`, [])).toEqual([item]);
  expect(await db.getAllAsync('SELECT date, mood FROM days', [])).toEqual([{ date: '2026-10-06', mood: 4 }]);
  expect(await db.getAllAsync('SELECT table_name, row_key FROM outbox', [])).toEqual([{ table_name: 'items', row_key: 'a' }]);
  expect(await db.getAllAsync('SELECT cursor FROM sync_state', [])).toEqual([{ cursor: 'u1' }]);
  expect(await db.getAllAsync('SELECT id FROM someday', [])).toEqual([]);

  const ins = (id: string, text: string, status: string | null, priority = 0) =>
    db.runAsync('INSERT INTO someday (id, text, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id, text, status, priority, TS, TS,
    ]);
  await expect(ins('s1', '책 읽기', 'open')).resolves.toBeDefined();
  await expect(ins('s2', '여행', 'migrated', 1)).resolves.toBeDefined();
  await expect(ins('s3', '  ', 'open')).rejects.toThrow();
  await expect(ins('s4', 'x', 'doing')).rejects.toThrow(); // 언젠가에는 진행 중이 없다
  await expect(ins('s5', 'x', null)).rejects.toThrow();
  await expect(ins('s6', 'x', 'open', 2)).rejects.toThrow();
});

test('v5 → v6: 줄 순서(position)를 더하고, 이미 있는 줄은 적은 순서대로 날짜마다(언젠가는 전체에서) 1, 2, 3…', async () => {
  const db = openTestDb();
  await migrate(db, 5);
  const cols = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
  const at = (m: number) => `2026-10-06T00:0${m}:00.000Z`;
  // 넣은 순서와 적은 시각이 다르다: 순서는 created_at, 같으면 id
  const items = [
    { id: 'c', date: '2026-10-06', kind: 'task', text: '셋', status: 'open', priority: 0, migrated_from: null, created_at: at(2), updated_at: at(2), deleted_at: null },
    { id: 'a', date: '2026-10-06', kind: 'note', text: '하나', status: null, priority: 0, migrated_from: null, created_at: at(1), updated_at: at(1), deleted_at: null },
    { id: 'b', date: '2026-10-06', kind: 'task', text: '둘', status: 'done', priority: 1, migrated_from: null, created_at: at(1), updated_at: at(1), deleted_at: TS },
    { id: 'z', date: '2026-10-07', kind: 'task', text: '다음 날', status: 'open', priority: 0, migrated_from: null, created_at: at(0), updated_at: at(0), deleted_at: null },
  ];
  for (const r of items) await db.runAsync(`INSERT INTO items (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(r));
  const ins = (id: string, created: string) =>
    db.runAsync('INSERT INTO someday (id, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, id, 'open', created, created]);
  await ins('s2', at(5));
  await ins('s1', at(3));
  await db.runAsync("INSERT INTO outbox (table_name, row_key) VALUES ('items', 'a')", []);

  await migrate(db);

  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 7 });
  // 원래 열은 그대로
  expect(await db.getAllAsync(`SELECT ${cols} FROM items ORDER BY id`, [])).toEqual(
    [...items].sort((x, y) => x.id.localeCompare(y.id)),
  );
  expect(await db.getAllAsync('SELECT id, position FROM items ORDER BY date, position', [])).toEqual([
    { id: 'a', position: 1 },
    { id: 'b', position: 2 },
    { id: 'c', position: 3 },
    { id: 'z', position: 1 },
  ]);
  expect(await db.getAllAsync('SELECT id, position FROM someday ORDER BY position', [])).toEqual([
    { id: 's1', position: 1 },
    { id: 's2', position: 2 },
  ]);
  // 순서를 매긴 건 이 기기의 새 열일 뿐이라 올릴 거리(outbox)를 늘리지 않는다
  expect(await db.getAllAsync('SELECT row_key FROM outbox', [])).toEqual([{ row_key: 'a' }]);
  // 자리값은 비워 둘 수 있다(예전 앱·서버에서 받은 줄)
  await expect(
    db.runAsync('INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'n', '2026-10-06', 'note', 'x', null, TS, TS,
    ]),
  ).resolves.toBeDefined();
});
