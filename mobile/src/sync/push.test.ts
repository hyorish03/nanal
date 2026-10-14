import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, dropItem } from '../items/repo';
import { setMood } from '../days/repo';
import { markDirty, pendingCount } from './outbox';
import { push } from './push';

const NOW = new Date(2026, 9, 6, 9, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('outbox의 행을 서버에 올리고 outbox를 비운다', async () => {
  const fake = createFakeRemote();
  const item = await addItem(db, { kind: 'task', text: 'a' }, NOW);
  await push(db, fake.remote);
  expect(fake.store.items.get(item.id)).toMatchObject({ id: item.id, text: 'a', status: 'open' });
  expect(await pendingCount(db)).toBe(0);
});

test('전송에 실패하면 outbox를 그대로 남긴다', async () => {
  const fake = createFakeRemote();
  await addItem(db, { kind: 'task', text: 'a' }, NOW);
  fake.state.failUpsert = true;
  await expect(push(db, fake.remote)).rejects.toThrow('network down');
  expect(await pendingCount(db)).toBe(1);
});

test('전송 중에 같은 행이 다시 바뀌면 outbox에 남겨 다음에 다시 보낸다', async () => {
  const fake = createFakeRemote();
  const item = await addItem(db, { kind: 'task', text: 'a' }, NOW);
  const upsert = fake.remote.upsert;
  fake.remote.upsert = async (table, rows) => {
    await upsert(table, rows);
    await advanceStatus(db, item.id, new Date(2026, 9, 6, 9, 1));
  };
  await push(db, fake.remote);
  expect(await pendingCount(db)).toBe(1);

  fake.remote.upsert = upsert;
  await push(db, fake.remote);
  expect(fake.store.items.get(item.id)).toMatchObject({ status: 'doing' });
  expect(await pendingCount(db)).toBe(0);
});

test('로컬에 없는 키는 outbox에서만 지운다', async () => {
  const fake = createFakeRemote();
  await markDirty(db, 'items', 'ghost');
  await push(db, fake.remote);
  expect(fake.state.upsertCalls).toBe(0);
  expect(await pendingCount(db)).toBe(0);
});

test('monthly_reviews는 month 키로 outbox에서 읽어 올린다', async () => {
  const fake = createFakeRemote();
  await db.runAsync(
    `INSERT INTO monthly_reviews (month, content, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ['2026-09', '{"version":1}', 'm', '2026-10-07T00:00:00.000Z', '2026-10-07T00:00:00.000Z'],
  );
  await db.transaction((tx) => markDirty(tx, 'monthly_reviews', '2026-09'));
  await push(db, fake.remote);
  expect(fake.store.monthly_reviews.get('2026-09')).toMatchObject({ month: '2026-09', content: { version: 1 } });
  expect(await pendingCount(db)).toBe(0);
});

test('서버가 아직 안 하기(dropped)를 모르면: items는 outbox에 남아 다음에 다시 보내고, 다른 표는 올라간다', async () => {
  const fake = createFakeRemote();
  const item = await addItem(db, { kind: 'task', text: 'a' }, NOW);
  await dropItem(db, item.id, NOW);
  await setMood(db, '2026-10-06', 3, NOW);
  // 서버 마이그레이션 전: items_status_check 위반(23514)으로 items 배치 전체가 거절된다
  const upsert = fake.remote.upsert;
  fake.remote.upsert = async (table, rows) => {
    if (table === 'items' && rows.some((r) => r.status === 'dropped')) {
      throw new Error('items 업로드 실패: new row violates check constraint "items_status_check"');
    }
    await upsert(table, rows);
  };
  await expect(push(db, fake.remote)).rejects.toThrow('items_status_check');
  expect(fake.store.days.get('2026-10-06')).toMatchObject({ mood: 3 });
  expect(await pendingCount(db)).toBe(1);
  expect((await listLocal(item.id))?.status).toBe('dropped'); // 로컬 기록은 그대로

  // 서버 마이그레이션 뒤에는 그대로 올라간다
  fake.remote.upsert = upsert;
  await push(db, fake.remote);
  expect(fake.store.items.get(item.id)).toMatchObject({ status: 'dropped' });
  expect(await pendingCount(db)).toBe(0);
});

const listLocal = (id: string) => db.getFirstAsync<{ status: string }>('SELECT status FROM items WHERE id = ?', [id]);
