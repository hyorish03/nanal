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

test('커서를 저장해 변경이 없으면 다시 반영하지 않는다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  await pull(db, fake.remote);
  expect(await pull(db, fake.remote)).toBe(false);
  expect(await db.getFirstAsync("SELECT cursor FROM sync_state WHERE table_name = 'items'", [])).toEqual({
    cursor: fake.store.items.get('srv-1')!.synced_at,
  });
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
