export type SqlParam = string | number | null;
export type Row = Record<string, SqlParam>;

// expo-sqlite의 SQLiteDatabase가 이 형태를 그대로 만족한다. 테스트는 better-sqlite3로 같은 형태를 구현한다.
// expo-sqlite의 트랜잭션은 같은 연결의 다른 쿼리와 격리되지 않으므로, 트랜잭션 중에는 관계없는 쿼리를 동시에 실행하지 않는다.
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
