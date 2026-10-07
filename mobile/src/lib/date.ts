export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');

export function logicalDate(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' 논리 날짜에 n일을 더한다. 시간대와 무관하게 달력 날짜만 계산한다.
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function partsOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

// 0=일요일
export function weekdayOf(date: string): number {
  const { y, m, d } = partsOf(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatLongDate(date: string): string {
  const { m, d } = partsOf(date);
  return `${m}월 ${d}일 ${WEEKDAYS[weekdayOf(date)]}요일`;
}

export function formatShortDate(date: string): string {
  const { m, d } = partsOf(date);
  return `${m}/${d}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}
