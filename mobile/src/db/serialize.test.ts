import { serialize } from './serialize';
import type { RawDb, Tx } from './types';

function fakeRaw(events: string[]): RawDb {
  const wait = () => new Promise<void>((r) => setTimeout(r, 5));
  const op = async (label: string) => {
    events.push(`start:${label}`);
    await wait();
    events.push(`end:${label}`);
  };
  return {
    async execAsync(sql) {
      await op(sql);
    },
    async runAsync(sql) {
      await op(sql);
      return { changes: 1 };
    },
    async getAllAsync<T>(sql: string) {
      await op(sql);
      return [] as T[];
    },
    async getFirstAsync<T>(sql: string) {
      await op(sql);
      return null as T | null;
    },
    async withTransactionAsync(task) {
      events.push('begin');
      try {
        await task();
        events.push('commit');
      } catch (e) {
        events.push('rollback');
        throw e;
      }
    },
  };
}

test('동시에 시작한 트랜잭션과 쿼리가 서로 끼어들지 않는다', async () => {
  const events: string[] = [];
  const db = serialize(fakeRaw(events));
  const t1 = db.transaction(async (tx) => {
    await tx.runAsync('a', []);
    await tx.runAsync('b', []);
  });
  const r = db.runAsync('x', []);
  const t2 = db.transaction(async (tx) => {
    await tx.runAsync('c', []);
  });
  await Promise.all([t1, r, t2]);
  expect(events).toEqual([
    'begin', 'start:a', 'end:a', 'start:b', 'end:b', 'commit',
    'start:x', 'end:x',
    'begin', 'start:c', 'end:c', 'commit',
  ]);
});

test('task가 던지면 롤백하고 그 오류로 reject하며 큐는 막히지 않는다', async () => {
  const events: string[] = [];
  const db = serialize(fakeRaw(events));
  await expect(
    db.transaction(async () => {
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  expect(events).toEqual(['begin', 'rollback']);
  await db.runAsync('after', []);
  expect(events.slice(2)).toEqual(['start:after', 'end:after']);
});

test('transaction은 task의 반환값을 돌려준다', async () => {
  const db = serialize(fakeRaw([]));
  expect(await db.transaction(async () => 42)).toBe(42);
});

test('끝난 트랜잭션의 tx는 쓸 수 없다', async () => {
  const db = serialize(fakeRaw([]));
  let captured!: Tx;
  await db.transaction(async (tx) => {
    captured = tx;
  });
  await expect(captured.runAsync('x', [])).rejects.toThrow('트랜잭션이 이미 끝났습니다');

  let captured2!: Tx;
  await expect(
    db.transaction(async (tx) => {
      captured2 = tx;
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  await expect(captured2.getAllAsync('x', [])).rejects.toThrow('트랜잭션이 이미 끝났습니다');
});
