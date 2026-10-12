import type { Db } from '../db/types';
import { WIDGET_SQL } from '../widget/sql';

// 스트릭 대신 줄어들지 않는 누적 일수를 보여준다(스펙 4절). 위젯과 같은 SQL을 쓴다.
export async function countRecordedDays(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.recordedDays, []);
  return row?.n ?? 0;
}
