import { monthGrid } from './calendar';

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
