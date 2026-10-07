import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { addItem } from '../items/repo';
import { createSyncEngine } from './engine';

test('동시에 여러 번 호출해도 한 번만 실행된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
  expect(fake.state.upsertCalls).toBe(1);
});

test('서버에서 바뀐 것이 있으면 onPulled를 부른다', async () => {
  const db = openTestDb();
  await migrate(db);
  const fake = createFakeRemote();
  fake.serverWrite('days', { user_id: 'u1', date: '2026-10-06', mood: 3, updated_at: '2026-10-06T00:00:00Z', deleted_at: null });
  const onPulled = jest.fn();
  const engine = createSyncEngine(db, fake.remote, onPulled);

  await engine.sync();
  await engine.sync();
  expect(onPulled).toHaveBeenCalledTimes(1);
});

test('실패해도 다음 호출은 다시 실행된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  fake.state.failUpsert = true;
  await expect(engine.sync()).rejects.toThrow('network down');
  fake.state.failUpsert = false;
  await engine.sync();
  expect(fake.store.items.size).toBe(1);
});
