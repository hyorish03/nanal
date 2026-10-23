import { assertEquals } from 'jsr:@std/assert@1';
import { canSetStatus, checkAddDate, checkRange, cleanText, logicalToday, summarizeDays } from './logic.ts';

Deno.test('logicalToday: 서울 시간 기준, 새벽 4시 전은 전날', () => {
  assertEquals(logicalToday(new Date('2026-10-20T18:59:00Z')), '2026-10-20'); // 21일 03:59 KST
  assertEquals(logicalToday(new Date('2026-10-20T19:00:00Z')), '2026-10-21'); // 21일 04:00 KST
  assertEquals(logicalToday(new Date('2026-12-31T20:00:00Z')), '2027-01-01'); // 1월 1일 05:00 KST
});

Deno.test('cleanText: 공백만 있거나 200자 넘으면 거절', () => {
  assertEquals(cleanText('  우유 사기 '), { ok: true, text: '우유 사기' });
  assertEquals(cleanText('   ').ok, false);
  assertEquals(cleanText('가'.repeat(200)).ok, true);
  assertEquals(cleanText('가'.repeat(201)).ok, false);
});

Deno.test('checkAddDate: 없으면 오늘, 지난 날·없는 날·1년 넘게 먼 날은 거절', () => {
  const today = '2026-10-21';
  assertEquals(checkAddDate(undefined, today), { ok: true, date: today });
  assertEquals(checkAddDate('2026-10-23', today), { ok: true, date: '2026-10-23' });
  assertEquals(checkAddDate('2026-10-20', today).ok, false);
  assertEquals(checkAddDate('2026-02-30', today).ok, false);
  assertEquals(checkAddDate('2027-10-22', today).ok, false);
});

Deno.test('checkRange: 형식·순서·최대 62일', () => {
  assertEquals(checkRange('2026-09-01', '2026-10-31').ok, true);
  assertEquals(checkRange('2026-10-02', '2026-10-01').ok, false);
  assertEquals(checkRange('2026-08-01', '2026-10-31').ok, false);
});

Deno.test('canSetStatus: 할 일만, 옮긴 일은 안 됨', () => {
  assertEquals(canSetStatus('task', 'open'), true);
  assertEquals(canSetStatus('task', 'dropped'), true);
  assertEquals(canSetStatus('task', 'migrated'), false);
  assertEquals(canSetStatus('note', null), false);
});

Deno.test('summarizeDays: 옮긴 일은 원래 날에서 빼고, 안 하기는 따로, 기록 없는 날은 없음', () => {
  const s = summarizeDays(
    [
      { date: '2026-10-01', kind: 'task', status: 'done' },
      { date: '2026-10-01', kind: 'task', status: 'migrated' },
      { date: '2026-10-01', kind: 'task', status: 'dropped' },
      { date: '2026-10-01', kind: 'note', status: null },
      { date: '2026-10-02', kind: 'task', status: 'open' },
    ],
    [{ date: '2026-10-02', mood: 4 }, { date: '2026-10-03', mood: null }],
    [{ date: '2026-10-02' }],
  );
  assertEquals(s, [
    { date: '2026-10-01', mood: null, tasks: 1, done: 1, dropped: 1, notes: 1, reflections: 0 },
    { date: '2026-10-02', mood: 4, tasks: 1, done: 0, dropped: 0, notes: 0, reflections: 1 },
  ]);
});
