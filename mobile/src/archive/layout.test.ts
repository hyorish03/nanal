import { calendarPaneWidth, dayTasksLine, hasPlanned, isTwoPane } from './layout';
import type { DaySummary } from './repo';

const day = (over: Partial<DaySummary>): DaySummary => ({
  date: '2026-10-05',
  mood: null,
  hasReflection: false,
  tasksDone: 0,
  tasksTotal: 0,
  tasksMigrated: 0,
  tasksDropped: 0,
  ...over,
});

test('휴대폰 배치는 폭과 상관없이 한 줄로 쌓는다', () => {
  expect(isTwoPane('compact', 1200)).toBe(false);
});

test('넓은 배치라도 화면이 좁으면 한 줄로 쌓는다', () => {
  expect(isTwoPane('regular', 600)).toBe(false);
  expect(isTwoPane('regular', 800)).toBe(false);
  expect(isTwoPane('regular', 900)).toBe(true);
  expect(isTwoPane('wide', 1100)).toBe(true);
});

test('달력 칸 폭은 380~480 사이에서 화면을 따라간다', () => {
  expect(calendarPaneWidth(760)).toBe(380);
  expect(calendarPaneWidth(1000)).toBe(420);
  expect(calendarPaneWidth(1600)).toBe(480);
});

test('할 일 요약 문구', () => {
  expect(dayTasksLine(undefined)).toBe('기록이 없는 날이에요');
  expect(dayTasksLine(day({}))).toBe('이 날은 할 일을 적지 않았어요');
  expect(dayTasksLine(day({ tasksMigrated: 2 }))).toBe('다른 날로 넘긴 일만 있어요');
  expect(dayTasksLine(day({ tasksTotal: 3, tasksDone: 1 }))).toBe('할 일 3개 중 1개를 끝냈어요');
  expect(dayTasksLine(day({ tasksTotal: 3, tasksDone: 1, tasksMigrated: 1 }))).toBe('할 일 3개 중 1개를 끝냈어요, 1개는 다른 날로 넘겼어요');
});

test('안 하기로 한 일은 끝낸 일 수와 따로 적는다', () => {
  expect(dayTasksLine(day({ tasksTotal: 2, tasksDone: 1, tasksDropped: 1 }))).toBe('할 일 2개 중 1개를 끝냈어요, 1개는 안 하기로 했어요');
  expect(dayTasksLine(day({ tasksDropped: 2 }))).toBe('안 하기로 한 일만 있어요');
});

test('앞날: 미뤄 둔 할 일 수, 표시는 끝나지 않은 할 일이 있을 때만', () => {
  expect(dayTasksLine(day({ tasksTotal: 2 }), true)).toBe('이날 할 일 2개가 기다리고 있어요');
  expect(dayTasksLine(undefined, true)).toBe('아직 이날 할 일이 없어요');
  expect(hasPlanned(day({ tasksTotal: 2 }))).toBe(true);
  expect(hasPlanned(day({ tasksTotal: 1, tasksDone: 1 }))).toBe(false);
  expect(hasPlanned(undefined)).toBe(false);
});
