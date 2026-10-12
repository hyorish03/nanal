import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { getMonthlyReview, saveMonthlyReview } from './repo';

const content = {
  version: 1 as const,
  stats: {
    month: '2026-09', recordedDays: 7, days: [], lethargyDates: [],
    lethargyAvgGapDays: null, moodAverage: null, doneRate: null, carriedTotal: 0,
  },
  insights: { moodFlow: 'a', lethargy: { causes: [], summary: 'b' }, tasksAndMind: 'c', gratitude: '', oneThing: 'd' },
};

test('저장한 월간 회고를 읽는다', async () => {
  const db = openTestDb();
  await migrate(db);
  expect(await getMonthlyReview(db, '2026-09')).toBeNull();
  await saveMonthlyReview(db, { month: '2026-09', content, model: 'm', updated_at: '2026-10-07T01:00:00.000Z' });
  expect(await getMonthlyReview(db, '2026-09')).toEqual({
    month: '2026-09', content, model: 'm', updated_at: '2026-10-07T01:00:00.000Z',
  });
});

test('더 오래된 내용으로는 덮어쓰지 않고, outbox에 올리지 않는다(서버가 이미 가지고 있다)', async () => {
  const db = openTestDb();
  await migrate(db);
  await saveMonthlyReview(db, { month: '2026-09', content, model: 'new', updated_at: '2026-10-07T02:00:00.000Z' });
  await saveMonthlyReview(db, { month: '2026-09', content, model: 'old', updated_at: '2026-10-07T01:00:00.000Z' });
  expect((await getMonthlyReview(db, '2026-09'))?.model).toBe('new');
  expect(await db.getAllAsync('SELECT * FROM outbox', [])).toEqual([]);
});
