import type { Db } from '../db/types';

// 스트릭 대신 줄어들지 않는 누적 일수를 보여준다(스펙 4절).
export async function countRecordedDays(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT date FROM items WHERE deleted_at IS NULL
       UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
       UNION SELECT date FROM reflections WHERE deleted_at IS NULL
     )`,
    [],
  );
  return row?.n ?? 0;
}
