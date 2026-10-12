import { addMonths, monthOf } from '../lib/date';

// 지난 기록 배너가 가리키는 달: 오늘이 속한 달의 지난달(스펙 11.9, 매달 1일 이후)
export function reviewTargetMonth(today: string): string {
  return addMonths(monthOf(today), -1);
}

export function monthLabel(month: string): string {
  return `${Number(month.slice(5))}월`;
}
