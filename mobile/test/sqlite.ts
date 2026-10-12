import Database from 'better-sqlite3';
import { serialize } from '../src/db/serialize';
import type { Db, RawDb, SqlParam } from '../src/db/types';

export function openTestRawDb(): RawDb {
  const raw = new Database(':memory:');
  return {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: SqlParam[]) {
      const result = raw.prepare(sql).run(params);
      return { changes: result.changes };
    },
    async getAllAsync<T>(sql: string, params: SqlParam[]) {
      return raw.prepare(sql).all(params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlParam[]) {
      return (raw.prepare(sql).get(params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function openTestDb(): Db {
  return serialize(openTestRawDb());
}
