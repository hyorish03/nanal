export type SqlParam = string | number | null;
export type Row = Record<string, SqlParam>;

// expo-sqlite의 SQLiteDatabase가 이 형태를 그대로 만족한다. 테스트는 better-sqlite3로 같은 형태를 구현한다.
export interface RawDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// 트랜잭션 안에서 쓰는 쿼리 핸들. 바깥 Db와 같은 쿼리 메서드를 갖지만 직렬화 큐를 거치지 않는다.
export type Tx = Pick<RawDb, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

// 앱 코드가 쓰는 DB. 모든 호출은 도착 순서대로 하나씩 실행된다(expo-sqlite 트랜잭션은 같은 연결의 다른 쿼리와 격리되지 않기 때문).
// transaction 안에서는 반드시 인자로 받은 tx만 쓴다. 바깥 db를 쓰면 자기 차례를 기다리며 멈춘다.
export interface Db extends Tx {
  transaction<T>(task: (tx: Tx) => Promise<T>): Promise<T>;
}
