import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { markDirty, pendingCount } from './outbox';

test('같은 행을 여러 번 표시하면 한 줄로 합쳐지고 version이 오른다', async () => {
  const db = openTestDb();
  await migrate(db);
  await markDirty(db, 'items', 'a');
  await markDirty(db, 'items', 'a');
  await markDirty(db, 'days', '2026-10-06');
  expect(await pendingCount(db)).toBe(2);
  expect(
    await db.getFirstAsync('SELECT version FROM outbox WHERE table_name = ? AND row_key = ?', ['items', 'a']),
  ).toEqual({ version: 2 });
});
