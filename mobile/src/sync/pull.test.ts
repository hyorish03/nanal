import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { getMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, listItemsForDate } from '../items/repo';
import { pendingCount } from './outbox';
import { pull } from './pull';

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const serverItem = (overrides: Record<string, unknown>) => ({
  id: 'srv-1',
  user_id: 'u1',
  date: '2026-10-06',
  kind: 'task',
  text: '서버에서 옴',
  status: 'open',
  migrated_from: null,
  created_at: '2026-10-06T00:00:00+00:00',
  updated_at: '2026-10-06T00:00:00+00:00',
  deleted_at: null,
  ...overrides,
});

test('서버의 새 행을 로컬에 넣고 outbox에는 올리지 않는다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  expect(await pull(db, fake.remote)).toBe(true);
  expect(await listItemsForDate(db, '2026-10-06')).toMatchObject([
    { id: 'srv-1', text: '서버에서 옴', updated_at: '2026-10-06T00:00:00.000Z' },
  ]);
  expect(await pendingCount(db)).toBe(0);
});

test('로컬이 더 최신이면 로컬을 유지한다', async () => {
  const fake = createFakeRemote();
  const local = await addItem(db, { kind: 'task', text: '로컬 최신' }, new Date(Date.UTC(2026, 9, 6, 12)));
  fake.serverWrite('items', serverItem({ id: local.id, text: '서버 옛것', updated_at: '2026-10-06T01:00:00Z' }));
  expect(await pull(db, fake.remote)).toBe(false);
  expect((await listItemsForDate(db, local.date))[0].text).toBe('로컬 최신');
});

test('서버가 더 최신이면 덮어쓴다', async () => {
  const fake = createFakeRemote();
  const local = await addItem(db, { kind: 'task', text: '로컬 옛것' }, new Date(Date.UTC(2026, 9, 6, 1)));
  fake.serverWrite('items', serverItem({ id: local.id, date: local.date, text: '서버 최신', updated_at: '2026-10-06T12:00:00Z' }));
  expect(await pull(db, fake.remote)).toBe(true);
  expect((await listItemsForDate(db, local.date))[0].text).toBe('서버 최신');
});

const storedCursor = async () => {
  const row = await db.getFirstAsync<{ cursor: string }>("SELECT cursor FROM sync_state WHERE table_name = 'items'", []);
  return row ? JSON.parse(row.cursor) : null;
};

const manyItems = (n: number) =>
  Array.from({ length: n }, (_, i) => serverItem({ id: `srv-${i + 1}`, text: `서버 ${i + 1}` }));

const localIds = async () =>
  (await db.getAllAsync<{ id: string }>('SELECT id FROM items ORDER BY id', [])).map((r) => r.id);

test('커서를 저장해 변경이 없으면 다시 반영하지 않는다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  await pull(db, fake.remote);
  expect(await pull(db, fake.remote)).toBe(false);
  expect(await storedCursor()).toEqual({
    syncedAt: '2026-01-01T00:00:01.000123Z',
    key: 'srv-1',
  });
});

test('같은 synced_at 묶음이 페이지 경계에 걸려도 모두 반영한다', async () => {
  const fake = createFakeRemote();
  await fake.remote.upsert('items', manyItems(5));
  expect(await pull(db, fake.remote, { pageSize: 2 })).toBe(true);
  expect(await localIds()).toEqual(['srv-1', 'srv-2', 'srv-3', 'srv-4', 'srv-5']);
});

test('모든 행의 synced_at이 같고 페이지보다 많아도 끝나고 모두 반영한다', async () => {
  const fake = createFakeRemote();
  await fake.remote.upsert('items', manyItems(7));
  expect(await pull(db, fake.remote, { pageSize: 2 })).toBe(true);
  expect(await localIds()).toHaveLength(7);
});

test('행 수가 페이지 크기의 정확한 배수여도 끝나고 모두 반영한다', async () => {
  const fake = createFakeRemote();
  await fake.remote.upsert('items', manyItems(4));
  expect(await pull(db, fake.remote, { pageSize: 2 })).toBe(true);
  expect(await localIds()).toHaveLength(4);
});

test('데이터 오류가 아닌 실패는 건너뛰지 않고 던지며 커서를 옮기지 않는다', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const fake = createFakeRemote();
    fake.serverWrite('items', serverItem({ id: 'first' }));
    await pull(db, fake.remote);
    const before = await storedCursor();

    await fake.remote.upsert('items', [serverItem({ id: 'x1' }), serverItem({ id: 'x2' })]);
    const failing: Db = {
      ...db,
      transaction: (task) =>
        db.transaction((tx) =>
          task({
            ...tx,
            runAsync: async () => {
              throw new Error('disk I/O error');
            },
          }),
        ),
    };
    await expect(pull(failing, fake.remote)).rejects.toThrow('disk I/O error');
    expect(warn).not.toHaveBeenCalled();
    expect(await storedCursor()).toEqual(before);
    expect(await localIds()).toEqual(['first']);

    expect(await pull(db, fake.remote)).toBe(true);
    expect(await localIds()).toEqual(['first', 'x1', 'x2']);
  } finally {
    warn.mockRestore();
  }
});

test('저장된 커서 형식이 깨졌으면 처음부터 다시 받는다', async () => {
  const fake = createFakeRemote();
  await fake.remote.upsert('items', manyItems(3));
  await db.runAsync("INSERT INTO sync_state (table_name, cursor) VALUES ('items', ?)", [
    JSON.stringify({ syncedAt: 'abc', key: 'x' }),
  ]);
  expect(await pull(db, fake.remote)).toBe(true);
  expect(await localIds()).toHaveLength(3);
});

test('새 변경이 없는 두 번째 pull은 false이고 커서를 되돌리지 않는다', async () => {
  const fake = createFakeRemote();
  await fake.remote.upsert('items', manyItems(3));
  await pull(db, fake.remote, { pageSize: 2 });
  const before = await storedCursor();
  expect(before).toEqual({ syncedAt: '2026-01-01T00:00:01.000123Z', key: 'srv-3' });
  expect(await pull(db, fake.remote, { pageSize: 2 })).toBe(false);
  expect(await storedCursor()).toEqual(before);
});

test('로컬 CHECK를 어기는 서버 행은 경고하고 건너뛰며 나머지는 반영하고 다음 pull도 막히지 않는다', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const fake = createFakeRemote();
    await fake.remote.upsert('items', [
      serverItem({ id: 'a-ok' }),
      serverItem({ id: 'b-bad', kind: 'task', status: null }),
      serverItem({ id: 'c-ok' }),
    ]);
    expect(await pull(db, fake.remote)).toBe(true);
    expect(await localIds()).toEqual(['a-ok', 'c-ok']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0].join(' '))).toEqual(expect.stringContaining('b-bad'));
    expect(String(warn.mock.calls[0].join(' '))).toEqual(expect.stringContaining('items'));
    expect((await storedCursor()).key).toBe('c-ok');

    fake.serverWrite('items', serverItem({ id: 'd-ok' }));
    expect(await pull(db, fake.remote)).toBe(true);
    expect(await localIds()).toEqual(['a-ok', 'c-ok', 'd-ok']);
  } finally {
    warn.mockRestore();
  }
});

test('저장된 커서보다 조금 앞선 synced_at의 더 최신 행도 겹쳐 받아 반영한다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({ id: 'first' }));
  await pull(db, fake.remote);
  fake.store.items.set(
    'late',
    serverItem({ id: 'late', text: '늦게 커밋됨', synced_at: '2026-01-01T00:00:00.500000+00:00' }),
  );
  expect(await pull(db, fake.remote)).toBe(true);
  expect(await localIds()).toEqual(['first', 'late']);
});

test('date를 키로 쓰는 days도 반영한다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('days', { user_id: 'u1', date: '2026-10-06', mood: 4, updated_at: '2026-10-06T00:00:00Z', deleted_at: null });
  await pull(db, fake.remote);
  expect(await getMood(db, '2026-10-06')).toBe(4);
});

test('서버의 삭제 표시도 반영되어 목록에서 빠진다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  await pull(db, fake.remote);
  fake.serverWrite('items', serverItem({ deleted_at: '2026-10-06T02:00:00Z', updated_at: '2026-10-06T02:00:00Z' }));
  await pull(db, fake.remote);
  expect(await listItemsForDate(db, '2026-10-06')).toHaveLength(0);
});
