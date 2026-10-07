import { weekdayOf } from './date';

// 일요일부터 시작하는 달력 칸. 1일 앞의 빈 칸은 null, 나머지는 'YYYY-MM-DD'.
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekdayOf(`${month}-01`)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}
