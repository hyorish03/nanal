import { weekdayOf } from './date';

// 일요일부터 시작하는 달력 칸. 1일 앞의 빈 칸은 null, 나머지는 'YYYY-MM-DD'.
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekdayOf(`${month}-01`)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

// 달력을 주 단위 줄로 나눈다. 줄마다 꼭 7칸이라 칸 너비 반올림으로 줄이 밀리지 않는다(마지막 주 뒤는 null).
export function monthWeeks(month: string): (string | null)[][] {
  const cells = monthGrid(month);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    weeks.push([...week, ...Array<null>(7 - week.length).fill(null)]);
  }
  return weeks;
}
