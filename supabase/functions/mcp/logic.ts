// 나날 MCP의 순수 규칙: 논리 날짜, 입력 검사, 하루 요약. 외부 의존성 없는 코드라 deno test로 확인한다.
import { addDays, isValidDate } from '../_shared/dates.ts';

export const MAX_TEXT = 200; // 앱과 같은 한 줄 글자 수
export const MAX_RANGE_DAYS = 62; // get_range가 한 번에 읽는 최대 일수
export const TIME_ZONE = 'Asia/Seoul';
const DAY_START_HOUR = 4; // 새벽 4시 전은 전날(앱 logicalDate와 같은 규칙)

export type TaskStatus = 'open' | 'doing' | 'done' | 'migrated' | 'dropped';
export const SETTABLE_STATUS = ['open', 'doing', 'done', 'dropped'] as const;
export type SettableStatus = (typeof SETTABLE_STATUS)[number];

// 지금 시각의 논리 날짜('YYYY-MM-DD'). 서울 시간 새벽 4시 전이면 전날로 친다
export function logicalToday(now: Date = new Date(), timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return Number(get('hour')) < DAY_START_HOUR ? addDays(date, -1) : date;
}

// 글 한 줄: 앞뒤 공백을 지우고 비었거나 너무 길면 이유를 돌려준다
export function cleanText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: '내용이 비어 있어요.' };
  if (Array.from(t).length > MAX_TEXT) return { ok: false, error: `한 줄은 ${MAX_TEXT}자까지예요.` };
  return { ok: true, text: t };
}

// 새 줄을 넣을 날짜: 없으면 오늘, 지난 날·없는 날·1년 넘게 먼 날은 거절(앱 addItem과 같은 규칙)
export function checkAddDate(date: string | undefined, today: string): { ok: true; date: string } | { ok: false; error: string } {
  if (!date) return { ok: true, date: today };
  if (!isValidDate(date)) return { ok: false, error: '날짜는 YYYY-MM-DD 형식이어야 해요.' };
  if (date < today) return { ok: false, error: `지난 날짜에는 넣을 수 없어요(오늘은 ${today}).` };
  if (date > addDays(today, 365)) return { ok: false, error: '1년 넘게 먼 날짜에는 넣을 수 없어요.' };
  return { ok: true, date };
}

// 읽을 기간 확인: 형식, 순서, 최대 일수
export function checkRange(from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (!isValidDate(from) || !isValidDate(to)) return { ok: false, error: '날짜는 YYYY-MM-DD 형식이어야 해요.' };
  if (from > to) return { ok: false, error: 'from이 to보다 늦어요.' };
  if (addDays(from, MAX_RANGE_DAYS - 1) < to) return { ok: false, error: `한 번에 ${MAX_RANGE_DAYS}일까지 읽을 수 있어요.` };
  return { ok: true };
}

// 상태 바꾸기는 끝나지 않았거나 끝낸·안 하기로 한 할 일만. 옮긴 일(migrated)은 옮겨 간 줄을 바꾼다
export function canSetStatus(kind: string, status: TaskStatus | null): boolean {
  return kind === 'task' && status !== null && status !== 'migrated';
}

type ItemRow = { date: string; kind: string; status: TaskStatus | null };
type DayRow = { date: string; mood: number | null };
type ReflectionRow = { date: string };

export type DaySummary = { date: string; mood: number | null; tasks: number; done: number; dropped: number; notes: number; reflections: number };

// 기간의 날짜별 요약. 옮긴 일은 원래 날짜에서 세지 않는다(옮겨 간 날에 다시 있다). 기록이 하나도 없는 날은 뺀다
export function summarizeDays(items: ItemRow[], days: DayRow[], reflections: ReflectionRow[]): DaySummary[] {
  const by = new Map<string, DaySummary>();
  const get = (date: string) => {
    let s = by.get(date);
    if (!s) {
      s = { date, mood: null, tasks: 0, done: 0, dropped: 0, notes: 0, reflections: 0 };
      by.set(date, s);
    }
    return s;
  };
  for (const i of items) {
    if (i.kind === 'note') get(i.date).notes++;
    else if (i.status !== 'migrated') {
      const s = get(i.date);
      if (i.status === 'dropped') s.dropped++;
      else {
        s.tasks++;
        if (i.status === 'done') s.done++;
      }
    }
  }
  for (const d of days) if (d.mood !== null) get(d.date).mood = d.mood;
  for (const r of reflections) get(r.date).reflections++;
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
