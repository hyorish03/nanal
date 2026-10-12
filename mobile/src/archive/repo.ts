import type { Db } from '../db/types';
import { BUILTIN_TEMPLATES, LEGACY_TEMPLATES, type TemplateQuestion } from '../reflections/templates';

export type DaySummary = {
  date: string;
  mood: number | null;
  hasReflection: boolean;
  tasksDone: number;
  tasksTotal: number; // 다른 날로 옮겨 간 원래 항목은 빼고 센다
  tasksMigrated: number; // 그날 적었다가 다른 날로 옮긴 할 일
};

// 한 달('YYYY-MM') 중 기록이 있는 날의 요약. 기록한 날 세기(stats/recordedDays)와 같은 기준이다.
// 세 표에서 그 달 줄만 모아 날짜별로 한 번에 묶는다(날마다 하위 질의를 돌리지 않게).
export async function listMonthSummary(db: Db, month: string): Promise<DaySummary[]> {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const rows = await db.getAllAsync<{ date: string; mood: number | null; refl: number; done: number; total: number; migrated: number }>(
    `SELECT date, MAX(mood) AS mood, MAX(refl) AS refl, SUM(done) AS done, SUM(total) AS total, SUM(migrated) AS migrated
     FROM (
       SELECT date, NULL AS mood, 0 AS refl,
         (kind = 'task' AND status = 'done') AS done,
         (kind = 'task' AND status != 'migrated') AS total,
         (kind = 'task' AND status = 'migrated') AS migrated
       FROM items WHERE deleted_at IS NULL AND date BETWEEN ? AND ?
       UNION ALL
       SELECT date, mood, 0, 0, 0, 0 FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL AND date BETWEEN ? AND ?
       UNION ALL
       SELECT date, NULL, 1, 0, 0, 0 FROM reflections WHERE deleted_at IS NULL AND date BETWEEN ? AND ?
     )
     GROUP BY date
     ORDER BY date`,
    [from, to, from, to, from, to],
  );
  return rows.map((r) => ({
    date: r.date,
    mood: r.mood,
    hasReflection: r.refl === 1,
    tasksDone: r.done,
    tasksTotal: r.total,
    tasksMigrated: r.migrated,
  }));
}

// 회고 모아보기의 한 장: 질문마다 그 답을 붙여 둔다(답이 빈 질문은 뺀다).
export type ArchiveEntry = {
  id: string;
  date: string;
  template: string;
  templateName: string;
  mood: number | null;
  answers: { question: string; answer: string }[];
};

export type ReflectionFilter = { id: string; name: string; count: number };

type Snapshot = { name: string; questions: TemplateQuestion[] };

// 깨진 JSON이 한 줄 섞여 있어도 목록 전체가 못 열리지 않게 조용히 넘긴다
function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 스냅샷이 있으면 그것을, 없거나 읽지 못하면(예전 회고) 알려진 템플릿에서 이름과 질문을 복원한다
function snapshotOf(template: string, snapshot: string | null): Snapshot {
  const s = parseJson(snapshot) as Partial<Snapshot> | null;
  if (s && typeof s.name === 'string') return { name: s.name, questions: Array.isArray(s.questions) ? s.questions : [] };
  const known = [...BUILTIN_TEMPLATES, ...LEGACY_TEMPLATES].find((t) => t.id === template);
  return known ? { name: known.name, questions: known.questions } : { name: '회고', questions: [] };
}

function answersOf(questions: TemplateQuestion[], raw: string): { question: string; answer: string }[] {
  const parsed = parseJson(raw);
  const answers = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return questions.flatMap((q) => {
    const a = answers[q.key];
    return typeof a === 'string' && a ? [{ question: q.text, answer: a }] : [];
  });
}

// 회고 모아보기: 최신순으로 한 쪽(limit)씩. template을 주면 그 템플릿 회고만.
export async function listReflectionPage(
  db: Db,
  { limit, offset = 0, template = null }: { limit: number; offset?: number; template?: string | null },
): Promise<ArchiveEntry[]> {
  const rows = await db.getAllAsync<{ id: string; date: string; template: string; answers: string; snapshot: string | null; mood: number | null }>(
    `SELECT r.id, r.date, r.template, r.answers, r.snapshot,
       (SELECT mood FROM days WHERE date = r.date AND deleted_at IS NULL) AS mood
     FROM reflections r
     WHERE r.deleted_at IS NULL AND (? IS NULL OR r.template = ?)
     ORDER BY r.date DESC, r.created_at DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [template, template, limit, offset],
  );
  return rows.map((r) => {
    const snap = snapshotOf(r.template, r.snapshot);
    return { id: r.id, date: r.date, template: r.template, templateName: snap.name, mood: r.mood, answers: answersOf(snap.questions, r.answers) };
  });
}

// 회고 모아보기의 템플릿 필터: 쓰인 템플릿을 최근에 쓴 순서로, 개수와 함께. 지운 템플릿도 회고가 남아 있으면 보인다.
// 이름은 가장 최근 회고의 스냅샷에서 가져온다(SQLite는 MAX()와 함께 고른 열을 그 줄에서 가져온다).
export async function listReflectionFilters(db: Db): Promise<ReflectionFilter[]> {
  const rows = await db.getAllAsync<{ template: string; snapshot: string | null; count: number }>(
    `SELECT template, snapshot, COUNT(*) AS count, MAX(date || ' ' || created_at) AS latest
     FROM reflections WHERE deleted_at IS NULL
     GROUP BY template
     ORDER BY latest DESC`,
    [],
  );
  return rows.map((r) => ({ id: r.template, name: snapshotOf(r.template, r.snapshot).name, count: r.count }));
}
