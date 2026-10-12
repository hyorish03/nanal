import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { claimOwner } from './owner';

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
