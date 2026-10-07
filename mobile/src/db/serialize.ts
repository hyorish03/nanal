import type { Db, RawDb, SqlParam, Tx } from './types';

export function serialize(raw: RawDb): Db {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const run = tail.then(op, op);
    tail = run.catch(() => undefined);
    return run;
  };
  const tx: Tx = {
    execAsync: (sql: string) => raw.execAsync(sql),
    runAsync: (sql: string, params: SqlParam[]) => raw.runAsync(sql, params),
    getAllAsync: <T>(sql: string, params: SqlParam[]) => raw.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: SqlParam[]) => raw.getFirstAsync<T>(sql, params),
  };
  return {
    execAsync: (sql) => enqueue(() => raw.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => raw.runAsync(sql, params)),
    getAllAsync: <T>(sql: string, params: SqlParam[]) => enqueue(() => raw.getAllAsync<T>(sql, params)),
    getFirstAsync: <T>(sql: string, params: SqlParam[]) => enqueue(() => raw.getFirstAsync<T>(sql, params)),
    transaction: <T>(task: (tx: Tx) => Promise<T>) =>
      enqueue(async () => {
        let result!: T;
        await raw.withTransactionAsync(async () => {
          result = await task(tx);
        });
        return result;
      }),
  };
}
