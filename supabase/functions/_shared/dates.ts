// 'YYYY-MM-DD' / 'YYYY-MM' 날짜 문자열 도우미. 시간대와 무관하게 달력 날짜만 다룬다.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');
const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;

export function isValidDate(s: string): boolean {
  return DATE_RE.test(s) && fromUtc(toUtc(s)) === s;
}

export function isValidMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

export function addDays(date: string, n: number): string {
  const t = toUtc(date);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUtc(t);
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: fromUtc(new Date(Date.UTC(y, m, 0))) };
}

export function weekdayKo(date: string): string {
  return WEEKDAYS[toUtc(date).getUTCDay()];
}

// 두 날짜 사이 일수(b - a)
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}
