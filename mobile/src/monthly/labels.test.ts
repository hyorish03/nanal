import { monthLabel, reviewTargetMonth } from './labels';

test('돌아볼 달은 지난달', () => {
  expect(reviewTargetMonth('2026-10-07')).toBe('2026-09');
  expect(reviewTargetMonth('2027-01-01')).toBe('2026-12');
});

test('monthLabel', () => {
  expect(monthLabel('2026-09')).toBe('9월');
  expect(monthLabel('2026-10')).toBe('10월');
});
