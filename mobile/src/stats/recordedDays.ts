import type { Db } from '../db/types';
import { WIDGET_SQL } from '../widget/sql';

// 스트릭 대신 줄어들지 않는 누적 일수를 보여준다(스펙 4절). 위젯과 같은 SQL을 쓴다.
// today(논리 날짜)까지만 센다. 내일로 미룬 일이 앞날짜에 있어도 하루가 늘지 않는다.
export async function countRecordedDays(db: Db, today: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.recordedDays, [today, today, today]);
  return row?.n ?? 0;
}
