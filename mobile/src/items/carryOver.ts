import { daysBetween, formatDayWithWeekday } from '../lib/date';
import type { Item } from './repo';

// 넘어온 일(오늘 포스트잇·월초 정리)을 원래 날짜별로 묶어 보여 줄 때 쓰는 것들.

export type DateGroup = { date: string; items: Item[] };

// 원래 날짜별로 묶는다. 같은 날 안에서는 받은 순서(적은 순서) 그대로.
// 기본은 오래된 날부터(월초 정리), 'newest'면 가까운 날부터(포스트잇: 어제 묶음이 맨 위).
export function groupByDate(items: Item[], order: 'oldest' | 'newest' = 'oldest'): DateGroup[] {
  const groups: DateGroup[] = [];
  const byDate = new Map<string, DateGroup>();
  for (const item of items) {
    let g = byDate.get(item.date);
    if (!g) {
      g = { date: item.date, items: [] };
      byDate.set(item.date, g);
      groups.push(g);
    }
    g.items.push(item);
  }
  const dir = order === 'oldest' ? 1 : -1;
  return groups.sort((a, b) => (a.date < b.date ? -dir : a.date > b.date ? dir : 0));
}

// 앞에서부터 n줄만 남긴다(묶음을 건너 센다). 빈 묶음은 뺀다. '외 N개'로 접을 때
export function takeRows(groups: DateGroup[], n: number): DateGroup[] {
  const out: DateGroup[] = [];
  let left = n;
  for (const g of groups) {
    if (left <= 0) break;
    const items = g.items.slice(0, left);
    left -= items.length;
    out.push({ date: g.date, items });
  }
  return out;
}

// 오늘(논리 날짜)에서 본 그날: 어제 · 그저께 · N일 전
export function relativeDay(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n === 1) return '어제';
  if (n === 2) return '그저께';
  return `${n}일 전`;
}

// 묶음 머리: "어제 · 10월 13일(화)에 적은 일"
export function carryGroupLabel(date: string, today: string): string {
  return `${relativeDay(date, today)} · ${formatDayWithWeekday(date)}에 적은 일`;
}
