import { monthGrid, monthWeeks } from './calendar';

test('일요일부터 시작하고 1일 앞은 빈 칸이다', () => {
  const cells = monthGrid('2026-10'); // 10월 1일은 목요일
  expect(cells).toHaveLength(35);
  expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
  expect(cells[4]).toBe('2026-10-01');
  expect(cells[34]).toBe('2026-10-31');
});

test('일요일에 시작하는 2월은 빈 칸이 없다', () => {
  const cells = monthGrid('2026-02');
  expect(cells).toHaveLength(28);
  expect(cells[0]).toBe('2026-02-01');
});

test('주 단위 줄은 모두 7칸이고 요일 자리가 맞는다', () => {
  const weeks = monthWeeks('2026-10');
  expect(weeks).toHaveLength(5);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
  expect(weeks[0][4]).toBe('2026-10-01'); // 목요일 칸
  expect(weeks[4]).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  const aug = monthWeeks('2026-08'); // 8월 1일은 토요일, 31일은 월요일
  expect(aug[0][6]).toBe('2026-08-01');
  expect(aug[5]).toEqual(['2026-08-30', '2026-08-31', null, null, null, null, null]);
});
