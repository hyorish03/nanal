import type { SQLiteDatabase } from 'expo-sqlite';
import type { RawDb } from '../src/db/types';
import { openTestDb, openTestRawDb } from './sqlite';

// 실제 expo-sqlite DB가 Db를 만족하는지 컴파일 시점에 확인한다.
const _assignable: RawDb = null as unknown as SQLiteDatabase;
void _assignable;

test('조회, 삽입, 트랜잭션 롤백이 동작한다', async () => {
  const db = openTestRawDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
  expect((await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1])).changes).toBe(1);
  expect((await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['c', 3])).changes).toBe(1);

  await expect(
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');

  expect(await db.getAllAsync('SELECT id FROM t ORDER BY id', [])).toEqual([{ id: 'a' }, { id: 'c' }]);
  expect(await db.getFirstAsync('SELECT id FROM t WHERE id = ?', ['zzz'])).toBeNull();
});

test('transaction은 tx로 쓴 변경을 커밋하고, 던지면 롤백한다', async () => {
  const db = openTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY)');
  await db.transaction(async (tx) => {
    await tx.runAsync('INSERT INTO t (id) VALUES (?)', ['a']);
  });
  await expect(
    db.transaction(async (tx) => {
      await tx.runAsync('INSERT INTO t (id) VALUES (?)', ['b']);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(await db.getAllAsync('SELECT id FROM t', [])).toEqual([{ id: 'a' }]);
});
