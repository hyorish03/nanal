import { logicalDate } from '../lib/date';
import { carryGroupLabel, groupByDate, relativeDay, takeRows } from './carryOver';
import type { Item } from './repo';

const item = (id: string, date: string): Item => ({
  id,
  date,
  kind: 'task',
  text: id,
  status: 'open',
  priority: false,
  migrated_from: null,
  delay_reason: null,
  position: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
});

test('carryGroupLabel: 어제 · 그저께 · N일 전 + 날짜(요일)에 적은 일', () => {
  expect(carryGroupLabel('2026-10-13', '2026-10-14')).toBe('어제 · 10월 13일(화)에 적은 일');
  expect(carryGroupLabel('2026-10-12', '2026-10-14')).toBe('그저께 · 10월 12일(월)에 적은 일');
  expect(carryGroupLabel('2026-09-27', '2026-10-14')).toBe('17일 전 · 9월 27일(일)에 적은 일');
  expect(relativeDay('2026-10-11', '2026-10-14')).toBe('3일 전');
});

test('relativeDay: 달·해를 넘겨 센다', () => {
  expect(relativeDay('2026-09-30', '2026-10-01')).toBe('어제');
  expect(relativeDay('2026-12-31', '2027-01-02')).toBe('그저께');
  expect(relativeDay('2026-02-28', '2026-03-01')).toBe('어제');
  expect(relativeDay('2025-10-14', '2026-10-14')).toBe('365일 전');
});

test('carryGroupLabel: 새벽 4시 전은 전날이 오늘이다(논리 날짜)', () => {
  // 10월 15일 새벽 3시 59분은 아직 14일. 13일은 '어제'
  const beforeDawn = logicalDate(new Date(2026, 9, 15, 3, 59));
  expect(carryGroupLabel('2026-10-13', beforeDawn)).toBe('어제 · 10월 13일(화)에 적은 일');
  // 4시부터는 15일. 13일은 '그저께'
  const dawn = logicalDate(new Date(2026, 9, 15, 4, 0));
  expect(carryGroupLabel('2026-10-13', dawn)).toBe('그저께 · 10월 13일(화)에 적은 일');
});

test('groupByDate newest: 가까운 날 묶음이 위, 같은 날은 받은 순서대로', () => {
  const groups = groupByDate(
    [item('a', '2026-09-27'), item('b', '2026-10-13'), item('c', '2026-10-12'), item('d', '2026-10-13')],
    'newest',
  );
  expect(groups.map((g) => g.date)).toEqual(['2026-10-13', '2026-10-12', '2026-09-27']);
  expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'd']);
});

test('takeRows: 묶음을 건너 앞에서부터 n줄만 남긴다', () => {
  const groups = groupByDate([item('a', '2026-10-13'), item('b', '2026-10-13'), item('c', '2026-10-12'), item('d', '2026-10-12'), item('e', '2026-09-27')], 'newest');
  const shown = takeRows(groups, 3);
  expect(shown.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
    ['2026-10-13', ['a', 'b']],
    ['2026-10-12', ['c']],
  ]);
  expect(takeRows(groups, 10)).toEqual(groups);
  expect(takeRows(groups, 0)).toEqual([]);
});
