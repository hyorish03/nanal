import { parseReviewContent } from './content';

const valid = {
  version: 1,
  stats: {
    month: '2026-09', recordedDays: 8,
    days: [{ date: '2026-09-01', mood: 2, tasks: 2, done: 1, carried: 1, lethargy: true }],
    lethargyDates: ['2026-09-01'], lethargyAvgGapDays: null, moodAverage: 2, doneRate: 0.5, carriedTotal: 1,
  },
  insights: {
    moodFlow: '흐름', lethargy: { causes: [{ label: '잠 부족', count: 1 }], summary: '요약' },
    tasksAndMind: '할 일', gratitude: '', oneThing: '한 가지',
  },
};

test('올바른 내용은 그대로 돌려준다', () => {
  expect(parseReviewContent(valid)).toEqual(valid);
});

test('모양이 다르면 null', () => {
  expect(parseReviewContent(null)).toBeNull();
  expect(parseReviewContent({ ...valid, version: 2 })).toBeNull();
  expect(parseReviewContent({ ...valid, insights: { ...valid.insights, moodFlow: 1 } })).toBeNull();
  expect(parseReviewContent({ ...valid, stats: { ...valid.stats, days: 'x' } })).toBeNull();
});
