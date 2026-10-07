import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addReflection, listReflections } from './repo';

const NOW = new Date(2026, 9, 6, 23, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('답변을 정리해 저장하고 다시 읽는다', async () => {
  const saved = await addReflection(
    db,
    { template: 'lethargy', answers: { cause: ' 잠 부족 ', recovery: '', unknown: '무시됨' } },
    NOW,
  );
  expect(saved).toMatchObject({ date: '2026-10-06', template: 'lethargy', answers: { cause: '잠 부족' } });

  const list = await listReflections(db, '2026-10-06');
  expect(list).toHaveLength(1);
  expect(list[0].answers).toEqual({ cause: '잠 부족' });
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([
    { row_key: saved.id },
  ]);
});

test('모든 답변이 비어 있으면 거부한다', async () => {
  await expect(addReflection(db, { template: 'gratitude', answers: { good: '  ' } }, NOW)).rejects.toThrow(
    '하나 이상',
  );
});
