import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { addItem } from '../items/repo';
import { claimOwner, wipeLocalData } from './owner';

test('처음 claim하면 ok', async () => {
  const db = openTestDb();
  await migrate(db);
  expect(await claimOwner(db, 'u1')).toBe('ok');
});

test('같은 사용자가 다시 claim하면 ok', async () => {
  const db = openTestDb();
  await migrate(db);
  await claimOwner(db, 'u1');
  expect(await claimOwner(db, 'u1')).toBe('ok');
});

test('다른 사용자가 claim하면 mismatch이고 소유자는 바뀌지 않는다', async () => {
  const db = openTestDb();
  await migrate(db);
  await claimOwner(db, 'u1');
  expect(await claimOwner(db, 'u2')).toBe('mismatch');
  expect(await claimOwner(db, 'u1')).toBe('ok');
});

test('wipeLocalData: 기록·보낼 목록·소유자를 비워 다른 계정이 새로 claim할 수 있다', async () => {
  const db = openTestDb();
  await migrate(db);
  await claimOwner(db, 'user-a');
  await addItem(db, { kind: 'task', text: 'a' });
  await wipeLocalData(db);
  expect(await db.getAllAsync('SELECT id FROM items', [])).toEqual([]);
  expect(await db.getAllAsync('SELECT row_key FROM outbox', [])).toEqual([]);
  expect(await claimOwner(db, 'user-b')).toBe('ok');
});
