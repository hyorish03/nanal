import { logicalDate, addDays } from './date';

// new Date(y, m, d, h, min)은 기기 로컬 시간대 기준이므로 테스트가 시간대에 의존하지 않는다.
test('04:00부터는 그날이다', () => {
  expect(logicalDate(new Date(2026, 9, 6, 4, 0))).toBe('2026-10-06');
  expect(logicalDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
});

test('00:00~03:59는 전날이다', () => {
  expect(logicalDate(new Date(2026, 9, 6, 0, 0))).toBe('2026-10-05');
  expect(logicalDate(new Date(2026, 9, 6, 3, 59))).toBe('2026-10-05');
});

test('월과 연도 경계를 넘어간다', () => {
  expect(logicalDate(new Date(2026, 10, 1, 2, 0))).toBe('2026-10-31');
  expect(logicalDate(new Date(2027, 0, 1, 1, 0))).toBe('2026-12-31');
});

test('addDays는 달과 해를 넘긴다', () => {
  expect(addDays('2026-10-07', 1)).toBe('2026-10-08');
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});
