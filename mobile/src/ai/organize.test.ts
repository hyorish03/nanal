import { dateLabel, toDrafts } from './organize';

test('정리 결과는 모두 체크된 채로 시작한다', () => {
  const drafts = toDrafts([
    { kind: 'task', text: '책 사기', date: '2026-10-07' },
    { kind: 'note', text: '빨래 예약', date: '2026-10-07' },
  ]);
  expect(drafts.map((d) => [d.text, d.picked])).toEqual([
    ['책 사기', true],
    ['빨래 예약', true],
  ]);
  expect(new Set(drafts.map((d) => d.id)).size).toBe(2);
});

test('dateLabel: 오늘은 비우고, 내일은 "내일", 그 밖은 월/일', () => {
  expect(dateLabel('2026-10-07', '2026-10-07')).toBe('');
  expect(dateLabel('2026-10-08', '2026-10-07')).toBe('내일');
  expect(dateLabel('2026-10-12', '2026-10-07')).toBe('10/12');
});
