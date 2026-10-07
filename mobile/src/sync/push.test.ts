import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus } from '../items/repo';
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
