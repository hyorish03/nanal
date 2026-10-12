import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { getMood, setMood } from './repo';

const NOW = new Date(2026, 9, 6, 22, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기분을 저장하고 다시 고치면 덮어쓴다', async () => {
  await setMood(db, '2026-10-06', 3, NOW);
  await setMood(db, '2026-10-06', 5, NOW);
  expect(await getMood(db, '2026-10-06')).toBe(5);
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'days'", [])).toEqual([
    { row_key: '2026-10-06' },
  ]);
});

test('null로 기분을 지울 수 있다', async () => {
  await setMood(db, '2026-10-06', 3, NOW);
  await setMood(db, '2026-10-06', null, NOW);
  expect(await getMood(db, '2026-10-06')).toBeNull();
});

test('1~5 정수가 아니면 거부한다', async () => {
  await expect(setMood(db, '2026-10-06', 0, NOW)).rejects.toThrow('1~5');
  await expect(setMood(db, '2026-10-06', 2.5, NOW)).rejects.toThrow('1~5');
});

test('기록이 없는 날은 null', async () => {
  expect(await getMood(db, '2026-10-01')).toBeNull();
});
