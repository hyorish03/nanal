import type { Db } from '../db/types';

// 앱과 위젯(targets/widget/SharedSQL.swift)이 같이 쓰는 SQL. 하나를 바꾸면 다른 하나도 똑같이 바꾼다
// (swiftParity.test.ts가 두 파일을 비교한다). 아래 TS 함수는 Swift가 하는 일을 그대로 실행해 앱 규칙과 같은지 시험하는 용도다.
export const WIDGET_SQL = {
  // 오늘 할 일: 진행 중(중요 먼저) → 할 일(중요 먼저) → 끝낸 일, 같은 칸 안에서는 입력 순. 메모·옮긴 원래 항목·지운 일은 뺀다(앱 목록은 적은 순서 그대로지만 위젯은 칸이 좁아 할 일을 앞에 모은다).
  items: `SELECT id, text, status, priority FROM items
WHERE date = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
ORDER BY CASE WHEN status = 'doing' THEN 1 - priority WHEN status IN ('done', 'migrated') THEN 4
ELSE 3 - priority END, created_at
LIMIT 8`,
  // 위젯에 그릴 수 있는 줄은 많아야 5개라 목록은 8개까지만 읽는다. 상태별 총 개수는 목록과 따로 센다.
  counts: `SELECT status, COUNT(*) AS n FROM items
WHERE date = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
GROUP BY status`,
  // 밀린 일 개수(listMigrationCandidates와 같은 조건)
  carried: `SELECT COUNT(*) AS n FROM items
WHERE date < ? AND kind = 'task' AND status IN ('open', 'doing') AND deleted_at IS NULL`,
  mood: `SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL`,
  // 기록한 날(스펙 4절): 할 일·메모, 기분, 회고 중 하나라도 있는 날
  recordedDays: `SELECT COUNT(*) AS n FROM (
SELECT date FROM items WHERE deleted_at IS NULL
UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
UNION SELECT date FROM reflections WHERE deleted_at IS NULL
)`,
  // advanceStatus와 같은 순서(open → doing → done → open). 위젯이 보여 준 상태(마지막 ?)와 같을 때만 바꾼다. 바뀐 행이 있을 때만 markDirty를 실행한다.
  advance: `UPDATE items
SET status = CASE status WHEN 'open' THEN 'doing' WHEN 'doing' THEN 'done' ELSE 'open' END, updated_at = ?
WHERE id = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done') AND status = ?`,
  markDirty: `INSERT INTO outbox (table_name, row_key) VALUES ('items', ?)
ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1`,
} as const;

export type WidgetItem = { id: string; text: string; status: 'open' | 'doing' | 'done'; priority: boolean };
export type WidgetCounts = { open: number; doing: number; done: number };
export type WidgetSnapshot = { items: WidgetItem[]; counts: WidgetCounts; carried: number; mood: number | null; recordedDays: number };

export async function readWidgetSnapshot(db: Db, today: string): Promise<WidgetSnapshot> {
  const rows = await db.getAllAsync<Omit<WidgetItem, 'priority'> & { priority: number }>(WIDGET_SQL.items, [today]);
  const countRows = await db.getAllAsync<{ status: keyof WidgetCounts; n: number }>(WIDGET_SQL.counts, [today]);
  const counts: WidgetCounts = { open: 0, doing: 0, done: 0 };
  for (const r of countRows) counts[r.status] = r.n;
  const carried = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.carried, [today]);
  const mood = await db.getFirstAsync<{ mood: number | null }>(WIDGET_SQL.mood, [today]);
  const recorded = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.recordedDays, []);
  return {
    items: rows.map((r) => ({ ...r, priority: r.priority === 1 })),
    counts,
    carried: carried?.n ?? 0,
    mood: mood?.mood ?? null,
    recordedDays: recorded?.n ?? 0,
  };
}

// 잠금화면 "다음 할 일": 정렬된 목록에서 끝내지 않은 첫 항목(진행 중 → 중요 → 목록 순)
export function pickNext(items: WidgetItem[]): WidgetItem | null {
  return items.find((i) => i.status !== 'done') ?? null;
}

export async function widgetAdvance(db: Db, id: string, expected: WidgetItem['status'], now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.runAsync(WIDGET_SQL.advance, [now.toISOString(), id, expected]);
    if (r.changes === 0) return false;
    await tx.runAsync(WIDGET_SQL.markDirty, [id]);
    return true;
  });
}
