export type SqlParam = string | number | null;
export type Row = Record<string, SqlParam>;

// expo-sqlite의 SQLiteDatabase가 이 형태를 그대로 만족한다. 테스트는 better-sqlite3로 같은 형태를 구현한다.
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
