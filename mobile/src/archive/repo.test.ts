import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, deleteItem, migrateToToday } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { listMonthSummary } from './repo';

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0);

test('기록이 있는 날만 기분, 회고 여부, 할 일 수와 함께 돌려준다', async () => {
  const a = await addItem(db, { kind: 'task', text: '보고서' }, at(5));
  await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  await addItem(db, { kind: 'note', text: '비' }, at(5));
  await advanceStatus(db, a.id, at(5));
  await advanceStatus(db, a.id, at(5)); // done
  await setMood(db, '2026-10-06', 2, at(6));
  await addReflection(db, { templateId: 'free', answers: { body: '조용한 날' } }, at(6));
  await setMood(db, '2026-09-30', 4, at(30)); // 다른 달

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 1, tasksTotal: 2 },
    { date: '2026-10-06', mood: 2, hasReflection: true, tasksDone: 0, tasksTotal: 0 },
  ]);
});

test('지운 항목과 다른 날로 옮긴 원래 항목은 세지 않는다', async () => {
  const a = await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  const b = await addItem(db, { kind: 'task', text: '책 반납' }, at(5));
  await deleteItem(db, b.id, at(5));
  await migrateToToday(db, a.id, at(7));

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 0 },
    { date: '2026-10-07', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 1 },
  ]);
});
