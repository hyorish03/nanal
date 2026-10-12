import { assertEquals } from 'jsr:@std/assert@1';
import { addDays, isValidDate, isValidMonth, monthRange, weekdayKo } from './dates.ts';

Deno.test('isValidDate: 형식과 실제 날짜를 모두 본다', () => {
  assertEquals(isValidDate('2026-10-07'), true);
  assertEquals(isValidDate('2026-02-30'), false);
  assertEquals(isValidDate('2026-1-7'), false);
  assertEquals(isValidDate('내일'), false);
});

Deno.test('isValidMonth', () => {
  assertEquals(isValidMonth('2026-09'), true);
  assertEquals(isValidMonth('2026-13'), false);
  assertEquals(isValidMonth('2026-9'), false);
});

Deno.test('addDays: 달과 해를 넘긴다', () => {
  assertEquals(addDays('2026-10-31', 1), '2026-11-01');
  assertEquals(addDays('2026-12-31', 1), '2027-01-01');
  assertEquals(addDays('2026-03-01', -1), '2026-02-28');
});

Deno.test('monthRange: 그 달의 첫날과 마지막 날', () => {
  assertEquals(monthRange('2026-09'), { from: '2026-09-01', to: '2026-09-30' });
  assertEquals(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
});

Deno.test('weekdayKo', () => {
  assertEquals(weekdayKo('2026-10-07'), '수');
});
