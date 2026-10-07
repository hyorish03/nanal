import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import { addItem, deleteItem } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { countRecordedDays } from './recordedDays';

test('항목, 기분, 회고 중 하나라도 있는 날을 한 번씩 센다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 1, 9));
  await addItem(db, { kind: 'note', text: 'b' }, new Date(2026, 9, 1, 10));
  await setMood(db, '2026-10-02', 4);
  await addReflection(db, { template: 'free', answers: { body: 'c' } }, new Date(2026, 9, 3, 22));
  await setMood(db, '2026-10-04', null);
  const removed = await addItem(db, { kind: 'note', text: 'd' }, new Date(2026, 9, 5, 9));
  await deleteItem(db, removed.id);

  expect(await countRecordedDays(db)).toBe(3);
});
