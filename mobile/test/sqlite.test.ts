import { openTestDb } from './sqlite';

test('조회, 삽입, 트랜잭션 롤백이 동작한다', async () => {
  const db = openTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
  await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);

  await expect(
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');

  expect(await db.getAllAsync('SELECT id FROM t')).toEqual([{ id: 'a' }]);
  expect(await db.getFirstAsync('SELECT id FROM t WHERE id = ?', ['zzz'])).toBeNull();
});
