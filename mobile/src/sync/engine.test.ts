import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { addItem } from '../items/repo';
import { createSyncEngine } from './engine';
import { pendingCount } from './outbox';

test('동시에 여러 번 호출해도 한 번만 실행된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
  // 첫 호출이 실행을 시작하고, 곧바로 이어진 두 호출은 "실행 중 요청"이라 추가 한 번(rerun)으로 합쳐진다.
  // 즉 전체 패스는 최대 2번이다. 항목은 첫 패스에서 이미 올라갔으므로 업로드는 여전히 1번뿐이다.
  expect(fake.state.upsertCalls).toBe(1);
});

test('실행 중 들어온 쓰기는 추가 패스에서 곧바로 올라간다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  let engine!: ReturnType<typeof createSyncEngine>;
  let second: Promise<void> | undefined;
  let injected = false;
  const remote = {
    ...fake.remote,
    async upsert(...args: Parameters<typeof fake.remote.upsert>) {
      if (!injected) {
        injected = true;
        // 첫 push가 이미 outbox를 읽은 뒤에 새 항목이 생기는 상황
        await addItem(db, { kind: 'task', text: 'b' }, new Date(2026, 9, 6, 10));
        second = engine.sync();
      }
      return fake.remote.upsert(...args);
    },
  };
  engine = createSyncEngine(db, remote);

  const first = engine.sync();
  await first;
  await second;
  expect(fake.store.items.size).toBe(2);
  expect(await pendingCount(db)).toBe(0);
});

test('추가 패스가 실패하면 기다리던 호출이 모두 거절되고 다음 호출은 새로 시작한다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  fake.state.failUpsert = true;
  const a = engine.sync();
  const b = engine.sync();
  await expect(a).rejects.toThrow('network down');
  await expect(b).rejects.toThrow('network down');
  expect(fake.state.upsertCalls).toBe(1); // 바로 재시도하지 않는다

  fake.state.failUpsert = false;
  await engine.sync();
  expect(fake.store.items.size).toBe(1);
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

test('push가 실패해도 pull은 진행하고 push 오류로 거절된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  fake.serverWrite('days', { user_id: 'u1', date: '2026-10-06', mood: 3, updated_at: '2026-10-06T00:00:00Z', deleted_at: null });
  const onPulled = jest.fn();
  const engine = createSyncEngine(db, fake.remote, onPulled);

  fake.state.failUpsert = true;
  await expect(engine.sync()).rejects.toThrow('network down');
  expect(onPulled).toHaveBeenCalledTimes(1);
});
