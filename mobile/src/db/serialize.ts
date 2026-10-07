import type { Db, RawDb, SqlParam, Tx } from './types';

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
      }),
  };
}
