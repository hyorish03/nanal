import type { Db } from '../db/types';

export type DaySummary = {
  date: string;
  mood: number | null;
  hasReflection: boolean;
  tasksDone: number;
  tasksTotal: number; // 다른 날로 옮겨 간 원래 항목은 빼고 센다
};

// 한 달('YYYY-MM') 중 기록이 있는 날의 요약. 기록한 날 세기(stats/recordedDays)와 같은 기준이다.
export async function listMonthSummary(db: Db, month: string): Promise<DaySummary[]> {
  const rows = await db.getAllAsync<{ date: string; mood: number | null; refl: number; done: number; total: number }>(
    `SELECT d.date AS date,
       (SELECT mood FROM days WHERE date = d.date AND deleted_at IS NULL) AS mood,
       EXISTS (SELECT 1 FROM reflections WHERE date = d.date AND deleted_at IS NULL) AS refl,
       (SELECT COUNT(*) FROM items WHERE date = d.date AND deleted_at IS NULL AND kind = 'task'
          AND status = 'done') AS done,
       (SELECT COUNT(*) FROM items WHERE date = d.date AND deleted_at IS NULL AND kind = 'task'
          AND status != 'migrated') AS total
     FROM (
       SELECT date FROM items WHERE deleted_at IS NULL
       UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
       UNION SELECT date FROM reflections WHERE deleted_at IS NULL
     ) d
     WHERE d.date BETWEEN ? AND ?
     ORDER BY d.date`,
    [`${month}-01`, `${month}-31`],
  );
  return rows.map((r) => ({
    date: r.date,
    mood: r.mood,
    hasReflection: r.refl === 1,
    tasksDone: r.done,
    tasksTotal: r.total,
  }));
}
