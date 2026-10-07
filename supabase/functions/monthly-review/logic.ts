// 월간 AI 회고(스펙 11.9): 한 달 통계 계산, 프롬프트, 출력 형식, 출력 검증. 외부 의존성 없는 순수 코드다.
// 숫자(기록한 날, 무기력했던 날, 간격, 완료율)는 여기서 계산하고, 모델은 글만 쓴다.
import { daysBetween, isValidMonth } from '../_shared/dates.ts';

export const REVIEW_MODEL = 'claude-sonnet-5-5';
export const REVIEW_MAX_TOKENS = 16000;
export const MIN_RECORDED_DAYS = 7;
const MAX_TEXT_CHARS = 800;

export type DayRow = { date: string; mood: number | null; deleted_at: string | null };
export type ItemRow = { date: string; kind: string; status: string | null; deleted_at: string | null };
export type ReflectionRow = {
  date: string;
  template: string;
  answers: Record<string, string>;
  snapshot: { name: string; questions: { key: string; text: string }[] } | null;
  deleted_at: string | null;
};

export type DayStat = { date: string; mood: number | null; tasks: number; done: number; carried: number; lethargy: boolean };
export type MonthStats = {
  month: string;
  recordedDays: number;
  days: DayStat[]; // 기록이 있는 날만, 날짜순
  lethargyDates: string[];
  lethargyAvgGapDays: number | null;
  moodAverage: number | null;
  doneRate: number | null; // 0~1
  carriedTotal: number;
};
export type ReviewInsights = {
  moodFlow: string;
  lethargy: { causes: { label: string; count: number }[]; summary: string };
  tasksAndMind: string;
  gratitude: string;
  oneThing: string;
};

// 예전 회고(스냅샷 없음)의 기본 템플릿 이름
const BUILTIN_NAMES: Record<string, string> = {
  lethargy: '무기력했던 날',
  gratitude: '감사한 날',
  free: '자유 일지',
  perfectionism: '완벽주의가 올라온 날',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function parseReviewInput(body: unknown): { month: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { month } = body as Record<string, unknown>;
  return typeof month === 'string' && isValidMonth(month) ? { month } : null;
}

// 기록한 날은 앱(stats/recordedDays)과 같은 기준: 항목, 기분, 회고 중 하나라도 있는 날.
export function aggregateMonth(month: string, days: DayRow[], items: ItemRow[], reflections: ReflectionRow[]): MonthStats {
  const liveDays = days.filter((d) => !d.deleted_at && d.mood !== null);
  const liveItems = items.filter((i) => !i.deleted_at);
  const liveRefl = reflections.filter((r) => !r.deleted_at);

  const dates = new Set<string>([...liveDays.map((d) => d.date), ...liveItems.map((i) => i.date), ...liveRefl.map((r) => r.date)]);
  const moodBy = new Map(liveDays.map((d) => [d.date, d.mood]));
  const lethargySet = new Set(liveRefl.filter((r) => r.template === 'lethargy').map((r) => r.date));

  const stats: DayStat[] = [...dates].sort().map((date) => {
    const tasks = liveItems.filter((i) => i.date === date && i.kind === 'task');
    return {
      date,
      mood: moodBy.get(date) ?? null,
      tasks: tasks.filter((t) => t.status !== 'migrated').length,
      done: tasks.filter((t) => t.status === 'done').length,
      carried: tasks.filter((t) => t.status === 'migrated').length,
      lethargy: lethargySet.has(date),
    };
  });

  const lethargyDates = [...lethargySet].sort();
  const gaps = lethargyDates.slice(1).map((d, i) => daysBetween(lethargyDates[i], d));
  const moods = stats.map((s) => s.mood).filter((m): m is number => m !== null);
  const taskTotal = stats.reduce((n, s) => n + s.tasks, 0);
  const doneTotal = stats.reduce((n, s) => n + s.done, 0);

  return {
    month,
    recordedDays: stats.length,
    days: stats,
    lethargyDates,
    lethargyAvgGapDays: gaps.length ? round1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    moodAverage: moods.length ? round1(moods.reduce((a, b) => a + b, 0) / moods.length) : null,
    doneRate: taskTotal ? round1(doneTotal / taskTotal) : null,
    carriedTotal: stats.reduce((n, s) => n + s.carried, 0),
  };
}

export const REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    moodFlow: { type: 'string' },
    lethargy: {
      type: 'object',
      properties: {
        causes: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, count: { type: 'integer' } },
            required: ['label', 'count'],
            additionalProperties: false,
          },
        },
        summary: { type: 'string' },
      },
      required: ['causes', 'summary'],
      additionalProperties: false,
    },
    tasksAndMind: { type: 'string' },
    gratitude: { type: 'string' },
    oneThing: { type: 'string' },
  },
  required: ['moodFlow', 'lethargy', 'tasksAndMind', 'gratitude', 'oneThing'],
  additionalProperties: false,
};

export const REVIEW_SYSTEM = [
  '너는 하루 기록 앱 "나날"에서 사용자의 한 달 기록을 함께 돌아보는 글을 쓴다.',
  '자료: 날짜별 기분 점수(1~5, 1이 가장 힘듦, 비어 있을 수 있음), 할 일 개수·끝낸 수·다른 날로 옮긴 수, 무기력했던 날 표시, 회고 질문과 답변.',
  '- 기록에 근거한 관찰만 쓴다. 판단, 진단, 칭찬이나 훈계, 의학·심리 용어를 쓰지 않는다.',
  '- 숫자와 날짜는 자료에 있는 것만 쓴다. 자료에 없는 일은 쓰지 않는다.',
  '- "-어요" 체, 짧은 문장. 각 글은 2~3문장.',
  '- moodFlow: 기분이 오르내린 모양과 요일·날짜와의 관계.',
  '- lethargy.causes: 무기력했던 날 회고 답변에서 반복된 원인을 짧은 낱말(예: "잠 부족")과 나온 횟수로, 많은 순서로 3개까지. 없으면 빈 배열.',
  '- lethargy.summary: 무기력했던 날에 대해 보이는 것과 회복에 도움이 됐다고 쓴 것. 무기력했던 날이 없으면 그렇다고 한 문장.',
  '- tasksAndMind: 할 일을 옮긴 수·끝낸 비율과 기분의 관계.',
  '- gratitude: 감사 회고에 자주 나온 것. 감사 회고가 없으면 빈 문자열.',
  '- oneThing: 다음 달에 해 볼 작은 행동 하나와, 그렇게 고른 근거 한 문장.',
].join('\n');

// 할 일 글은 보내지 않는다(스펙 11.9). 숫자와 회고 질문·답변만.
export function buildReviewMessage(stats: MonthStats, reflections: ReflectionRow[]): string {
  const monthNo = Number(stats.month.slice(5));
  const refl = reflections
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const questions = r.snapshot?.questions ?? Object.keys(r.answers).map((key) => ({ key, text: key }));
      return {
        date: r.date,
        template: r.snapshot?.name ?? BUILTIN_NAMES[r.template] ?? '회고',
        answers: questions.filter((q) => r.answers[q.key]).map((q) => ({ question: q.text, answer: r.answers[q.key] })),
      };
    });
  const data = {
    days: stats.days,
    lethargyDates: stats.lethargyDates,
    lethargyAvgGapDays: stats.lethargyAvgGapDays,
    moodAverage: stats.moodAverage,
    doneRate: stats.doneRate,
    carriedTotal: stats.carriedTotal,
    reflections: refl,
  };
  return `${monthNo}월(${stats.month}) 기록이다. 기록한 날 ${stats.recordedDays}일.\n<data>\n${JSON.stringify(data)}\n</data>`;
}

const text = (v: unknown, field: string): string => {
  if (typeof v !== 'string') throw new Error(`${field} 형식이 아닙니다`);
  return v.trim().slice(0, MAX_TEXT_CHARS);
};

export function validateInsights(raw: unknown): ReviewInsights {
  if (typeof raw !== 'object' || raw === null) throw new Error('회고 결과 형식이 아닙니다');
  const r = raw as Record<string, unknown>;
  const leth = (typeof r.lethargy === 'object' && r.lethargy !== null ? r.lethargy : {}) as Record<string, unknown>;
  const causes = Array.isArray(leth.causes) ? leth.causes : [];
  return {
    moodFlow: text(r.moodFlow, 'moodFlow'),
    lethargy: {
      causes: causes
        .map((c) => (typeof c === 'object' && c !== null ? (c as Record<string, unknown>) : {}))
        .filter((c) => typeof c.label === 'string' && c.label.trim() && Number.isInteger(c.count) && (c.count as number) > 0)
        .slice(0, 3)
        .map((c) => ({ label: (c.label as string).trim().slice(0, 30), count: c.count as number })),
      summary: text(leth.summary, 'lethargy.summary'),
    },
    tasksAndMind: text(r.tasksAndMind, 'tasksAndMind'),
    gratitude: text(r.gratitude, 'gratitude'),
    oneThing: text(r.oneThing, 'oneThing'),
  };
}
