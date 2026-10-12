import type { Db, RawDb, SqlParam, Tx } from './types';

// 위젯이 같은 DB를 쓰는 중이면 expo-sqlite가 SQLite의 "database is locked"(SQLITE_BUSY)를 그대로 던진다.
const isBusy = (e: unknown) => /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(e instanceof Error ? e.message : String(e));
const BUSY_RETRY_MS = 100;

export function serialize(raw: RawDb): Db {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const run = tail.then(op, op);
    tail = run.catch(() => undefined);
    return run;
  };
  const makeTx = (isActive: () => boolean): Tx => {
    const guard = <T>(op: () => Promise<T>): Promise<T> =>
      isActive() ? op() : Promise.reject(new Error('트랜잭션이 이미 끝났습니다'));
    return {
      execAsync: (sql: string) => guard(() => raw.execAsync(sql)),
      runAsync: (sql: string, params: SqlParam[]) => guard(() => raw.runAsync(sql, params)),
      getAllAsync: <T>(sql: string, params: SqlParam[]) => guard(() => raw.getAllAsync<T>(sql, params)),
      getFirstAsync: <T>(sql: string, params: SqlParam[]) => guard(() => raw.getFirstAsync<T>(sql, params)),
    };
  };
  return {
    execAsync: (sql) => enqueue(() => raw.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => raw.runAsync(sql, params)),
    getAllAsync: <T>(sql: string, params: SqlParam[]) => enqueue(() => raw.getAllAsync<T>(sql, params)),
    getFirstAsync: <T>(sql: string, params: SqlParam[]) => enqueue(() => raw.getFirstAsync<T>(sql, params)),
    transaction: <T>(task: (tx: Tx) => Promise<T>) =>
      enqueue(async () => {
        const attempt = async (): Promise<T> => {
          let active = true;
          const tx = makeTx(() => active);
          let result!: T;
          try {
            await raw.withTransactionAsync(async () => {
              result = await task(tx);
            });
          } finally {
            active = false;
          }
          return result;
        };
        try {
          return await attempt();
        } catch (e) {
          if (!isBusy(e)) throw e;
          await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
          return attempt(); // 롤백된 트랜잭션 전체를 한 번만 다시 한다
        }
      }),
  };
}
