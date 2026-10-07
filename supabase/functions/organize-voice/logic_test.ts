import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { buildOrganizeMessage, MAX_ITEMS, parseOrganizeInput, validateOrganized } from './logic.ts';

const TODAY = '2026-10-07';

Deno.test('parseOrganizeInput: 글과 오늘 날짜가 있어야 한다', () => {
  assertEquals(parseOrganizeInput({ text: '  빨래 널기 ', today: TODAY }), { text: '빨래 널기', today: TODAY });
  assertEquals(parseOrganizeInput(null), null);
  assertEquals(parseOrganizeInput({ text: '   ', today: TODAY }), null);
  assertEquals(parseOrganizeInput({ text: 'x', today: '10월 7일' }), null);
  assertEquals(parseOrganizeInput({ text: 'x'.repeat(2001), today: TODAY }), null);
});

Deno.test('buildOrganizeMessage: 오늘 날짜와 요일, 글을 담는다', () => {
  const msg = buildOrganizeMessage('내일 치과 전화', TODAY);
  assertStringIncludes(msg, '2026-10-07 (수요일)');
  assertStringIncludes(msg, '<transcript>\n내일 치과 전화\n</transcript>');
});

Deno.test('validateOrganized: 올바른 항목만 남기고 날짜를 바로잡는다', () => {
  const items = validateOrganized(
    {
      items: [
        { kind: 'task', text: ' 프론트엔드 펀더멘탈 책 사기 ', date: TODAY },
        { kind: 'task', text: '치과 전화', date: '2026-10-08' },
        { kind: 'note', text: '빨래 예약을 걸어 둠', date: '2026-10-01' }, // 지난 날짜 → 오늘
        { kind: 'task', text: '먼 미래', date: '2028-01-01' }, // 1년 넘게 → 오늘
        { kind: 'event', text: '일정', date: TODAY }, // 모르는 종류 → 버림
        { kind: 'task', text: '   ', date: TODAY }, // 빈 글 → 버림
        { kind: 'task', text: '날짜 이상', date: '내일' }, // 잘못된 날짜 → 오늘
      ],
    },
    TODAY,
  );
  assertEquals(items, [
    { kind: 'task', text: '프론트엔드 펀더멘탈 책 사기', date: TODAY },
    { kind: 'task', text: '치과 전화', date: '2026-10-08' },
    { kind: 'note', text: '빨래 예약을 걸어 둠', date: TODAY },
    { kind: 'task', text: '먼 미래', date: TODAY },
    { kind: 'task', text: '날짜 이상', date: TODAY },
  ]);
});

Deno.test('validateOrganized: 최대 개수까지만', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ kind: 'task', text: `할 일 ${i}`, date: TODAY }));
  assertEquals(validateOrganized({ items: many }, TODAY).length, MAX_ITEMS);
});

Deno.test('validateOrganized: 형식이 아니면 오류', () => {
  assertThrows(() => validateOrganized({ list: [] }, TODAY));
  assertThrows(() => validateOrganized('[]', TODAY));
});
