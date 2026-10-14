import type { LayoutClass } from '../ui/responsive';
import type { DaySummary } from './repo';

// 지난 기록 화면이 달력과 날짜 상세를 나란히 놓을 만큼 넓은지. 사이드바를 뺀 이 화면의 실제 폭으로 판단한다.
// 달력 380 + 칸 사이 32 + 상세 340 + 바깥 여백 40×2를 넘어야 둘 다 읽힌다.
export const TWO_PANE_MIN = 840;
export const CALENDAR_PANE_MIN = 380;
export const CALENDAR_PANE_MAX = 480;

export function isTwoPane(layout: LayoutClass, width: number): boolean {
  return layout !== 'compact' && width >= TWO_PANE_MIN;
}

// 왼쪽 달력 칸 폭: 바깥 여백을 뺀 폭의 절반이 조금 안 되게, 너무 좁거나 넓지 않게
export function calendarPaneWidth(width: number): number {
  return Math.round(Math.min(CALENDAR_PANE_MAX, Math.max(CALENDAR_PANE_MIN, width * 0.42)));
}

// 날짜 상세의 할 일 요약 한 줄. future: 오늘 뒤의 날(미뤄 둔 할 일만 있다)
export function dayTasksLine(day: DaySummary | undefined, future = false): string {
  if (future) return day && day.tasksTotal > 0 ? `이날 할 일 ${day.tasksTotal}개가 기다리고 있어요` : '아직 이날 할 일이 없어요';
  if (!day) return '기록이 없는 날이에요';
  if (day.tasksTotal === 0) {
    if (day.tasksMigrated > 0) return '다른 날로 넘긴 일만 있어요';
    return day.tasksDropped > 0 ? '안 하기로 한 일만 있어요' : '이 날은 할 일을 적지 않았어요';
  }
  const moved = day.tasksMigrated > 0 ? `, ${day.tasksMigrated}개는 다른 날로 넘겼어요` : '';
  const dropped = day.tasksDropped > 0 ? `, ${day.tasksDropped}개는 안 하기로 했어요` : '';
  return `할 일 ${day.tasksTotal}개 중 ${day.tasksDone}개를 끝냈어요${moved}${dropped}`;
}

// 지난 기록 달력에서 앞날 칸에 미뤄 둔 할 일 표시를 할지(끝나지 않은 할 일이 있는 날)
export function hasPlanned(day: DaySummary | undefined): boolean {
  return !!day && day.tasksTotal - day.tasksDone > 0;
}
