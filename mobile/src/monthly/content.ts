// 월간 회고 내용. 서버(supabase/functions/monthly-review/logic.ts)의 MonthStats·ReviewInsights와 같은 모양이다.
// 동기화로 받은 JSON을 화면에 그리기 전에 모양을 확인한다.
export type DayStat = { date: string; mood: number | null; tasks: number; done: number; carried: number; lethargy: boolean };
export type MonthStats = {
  month: string;
  recordedDays: number;
  days: DayStat[];
  lethargyDates: string[];
  lethargyAvgGapDays: number | null;
  moodAverage: number | null;
  doneRate: number | null;
  carriedTotal: number;
};
export type ReviewInsights = {
  moodFlow: string;
  lethargy: { causes: { label: string; count: number }[]; summary: string };
  tasksAndMind: string;
  gratitude: string;
  oneThing: string;
};
export type MonthlyReviewContent = { version: 1; stats: MonthStats; insights: ReviewInsights };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNumOrNull = (v: unknown) => v === null || typeof v === 'number';

export function parseReviewContent(raw: unknown): MonthlyReviewContent | null {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.stats) || !isObj(raw.insights)) return null;
  const { stats: s, insights: i } = raw;
  const daysOk =
    Array.isArray(s.days) &&
    s.days.every((d) => isObj(d) && isStr(d.date) && isNumOrNull(d.mood) && typeof d.lethargy === 'boolean');
  const statsOk =
    isStr(s.month) && typeof s.recordedDays === 'number' && daysOk &&
    Array.isArray(s.lethargyDates) && s.lethargyDates.every(isStr) &&
    isNumOrNull(s.lethargyAvgGapDays) && isNumOrNull(s.moodAverage) && isNumOrNull(s.doneRate);
  const leth = i.lethargy;
  const insightsOk =
    isStr(i.moodFlow) && isStr(i.tasksAndMind) && isStr(i.gratitude) && isStr(i.oneThing) &&
    isObj(leth) && isStr(leth.summary) && Array.isArray(leth.causes) &&
    leth.causes.every((c) => isObj(c) && isStr(c.label) && typeof c.count === 'number');
  return statsOk && insightsOk ? (raw as MonthlyReviewContent) : null;
}
