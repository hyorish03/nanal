import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import {
  aggregateMonth,
  buildReviewMessage,
  type DayRow,
  type ItemRow,
  parseReviewInput,
  type ReflectionRow,
  validateInsights,
} from './logic.ts';

const days: DayRow[] = [
  { date: '2026-09-01', mood: 2, deleted_at: null },
  { date: '2026-09-02', mood: 4, deleted_at: null },
  { date: '2026-09-03', mood: 5, deleted_at: '2026-09-04T00:00:00Z' }, // 지운 기분
  { date: '2026-09-04', mood: null, deleted_at: null }, // 기분 비움 → 기록 아님
];
const items: ItemRow[] = [
  { date: '2026-09-01', kind: 'task', status: 'done', deleted_at: null },
  { date: '2026-09-01', kind: 'task', status: 'migrated', deleted_at: null },
  { date: '2026-09-01', kind: 'task', status: 'open', deleted_at: null },
  { date: '2026-09-02', kind: 'note', status: null, deleted_at: null },
  { date: '2026-09-05', kind: 'task', status: 'done', deleted_at: '2026-09-05T00:00:00Z' }, // 지운 할 일
];
const reflections: ReflectionRow[] = [
  {
    date: '2026-09-01', template: 'lethargy', deleted_at: null,
    answers: { cause: '잠이 부족했다' },
    snapshot: { name: '무기력했던 날', questions: [{ key: 'cause', text: '무기력의 원인으로 짐작되는 것은?' }] },
  },
  { date: '2026-09-08', template: 'lethargy', deleted_at: null, answers: { cause: '마감' }, snapshot: null },
  { date: '2026-09-09', template: 'gratitude', deleted_at: '2026-09-10T00:00:00Z', answers: { good: 'x' }, snapshot: null },
];

Deno.test('aggregateMonth: 지운 행을 빼고 날짜별로 센다', () => {
  const s = aggregateMonth('2026-09', days, items, reflections);
  assertEquals(s.recordedDays, 3); // 1일, 2일, 8일
  assertEquals(s.days, [
    { date: '2026-09-01', mood: 2, tasks: 2, done: 1, carried: 1, lethargy: true },
    { date: '2026-09-02', mood: 4, tasks: 0, done: 0, carried: 0, lethargy: false },
    { date: '2026-09-08', mood: null, tasks: 0, done: 0, carried: 0, lethargy: true },
  ]);
  assertEquals(s.lethargyDates, ['2026-09-01', '2026-09-08']);
  assertEquals(s.lethargyAvgGapDays, 7);
  assertEquals(s.moodAverage, 3);
  assertEquals(s.doneRate, 0.5);
  assertEquals(s.carriedTotal, 1);
});

Deno.test('aggregateMonth: 비어 있으면 평균은 null', () => {
  const s = aggregateMonth('2026-09', [], [], []);
  assertEquals(s.recordedDays, 0);
  assertEquals(s.lethargyAvgGapDays, null);
  assertEquals(s.moodAverage, null);
  assertEquals(s.doneRate, null);
});

Deno.test('buildReviewMessage: 할 일 내용 없이 숫자와 회고만 보낸다', () => {
  const s = aggregateMonth('2026-09', days, items, reflections);
  const msg = buildReviewMessage(s, reflections);
  assertStringIncludes(msg, '9월');
  assertStringIncludes(msg, '무기력의 원인으로 짐작되는 것은?');
  assertStringIncludes(msg, '잠이 부족했다');
  assertStringIncludes(msg, '무기력했던 날'); // 스냅샷이 없어도 기본 이름
  assertEquals(msg.includes('"x"'), false); // 지운 회고는 보내지 않는다
});

Deno.test('parseReviewInput', () => {
  assertEquals(parseReviewInput({ month: '2026-09' }), { month: '2026-09' });
  assertEquals(parseReviewInput({ month: '2026-9' }), null);
  assertEquals(parseReviewInput(null), null);
});

Deno.test('validateInsights: 글을 다듬고 원인은 3개까지', () => {
  const v = validateInsights({
    moodFlow: ' 흐름 ',
    lethargy: {
      causes: [
        { label: '잠 부족', count: 3 },
        { label: '마감', count: 2 },
        { label: '점심', count: 2 },
        { label: '넷째', count: 1 },
        { label: '', count: 1 },
      ],
      summary: '요약',
    },
    tasksAndMind: '할 일',
    gratitude: '',
    oneThing: '한 가지',
  });
  assertEquals(v.moodFlow, '흐름');
  assertEquals(v.lethargy.causes, [
    { label: '잠 부족', count: 3 },
    { label: '마감', count: 2 },
    { label: '점심', count: 2 },
  ]);
  assertEquals(v.gratitude, '');
});

Deno.test('validateInsights: 형식이 아니면 오류', () => {
  assertThrows(() => validateInsights({ moodFlow: 1 }));
});
