import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import {
  addItem,
  deleteItem,
  dropItem,
  listItemsForDate,
  listMigrationCandidates,
  migrateToToday,
  toggleDone,
} from './repo';

const MON = new Date(2026, 9, 5, 9, 0); // 2026-10-05
const TUE = new Date(2026, 9, 6, 9, 0); // 2026-10-06

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const outboxKeys = async () =>
  (await db.getAllAsync<{ row_key: string }>("SELECT row_key FROM outbox WHERE table_name = 'items'", [])).map(
    (r) => r.row_key,
  );

test('addItem: 할 일은 open으로 논리 날짜에 저장되고 outbox에 오른다', async () => {
  const item = await addItem(db, { kind: 'task', text: '  보고서 쓰기 ' }, MON);
  expect(item).toMatchObject({ date: '2026-10-05', kind: 'task', text: '보고서 쓰기', status: 'open' });
  expect(await listItemsForDate(db, '2026-10-05')).toHaveLength(1);
  expect(await outboxKeys()).toEqual([item.id]);
});

test('addItem: 메모와 일정은 status가 없다', async () => {
  const note = await addItem(db, { kind: 'note', text: '생각' }, MON);
  expect(note.status).toBeNull();
});

test('addItem: 새벽 3시 입력은 전날로 저장된다', async () => {
  const item = await addItem(db, { kind: 'note', text: '늦은 생각' }, new Date(2026, 9, 6, 3, 0));
  expect(item.date).toBe('2026-10-05');
});

test('addItem: 빈 내용은 거부한다', async () => {
  await expect(addItem(db, { kind: 'task', text: '   ' }, MON)).rejects.toThrow('내용을 입력하세요');
});

test('toggleDone: open과 done을 오간다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await toggleDone(db, item.id, MON);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('done');
  await toggleDone(db, item.id, MON);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('open');
});

test('migrateToToday: 원래 항목은 migrated, 오늘 날짜로 연결된 새 할 일이 생긴다', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  const created = await migrateToToday(db, old.id, TUE);

  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
  expect(created).toMatchObject({ date: '2026-10-06', text: '운동', status: 'open', migrated_from: old.id });
  expect(created.id).not.toBe(old.id);
  expect((await outboxKeys()).sort()).toEqual([old.id, created.id].sort());
});

test('migrateToToday: 열린 할 일이 아니면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await toggleDone(db, item.id, MON);
  await expect(migrateToToday(db, item.id, TUE)).rejects.toThrow('열린 할 일만');
});

test('dropItem: 할 일을 dropped로 바꾼다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await dropItem(db, item.id, TUE);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('dropped');
});

test('listMigrationCandidates: 오늘 이전의 열린 할 일만, 삭제된 것은 빼고 돌려준다', async () => {
  const open = await addItem(db, { kind: 'task', text: 'open' }, MON);
  const done = await addItem(db, { kind: 'task', text: 'done' }, MON);
  await toggleDone(db, done.id, MON);
  const deleted = await addItem(db, { kind: 'task', text: 'deleted' }, MON);
  await deleteItem(db, deleted.id, MON);
  await addItem(db, { kind: 'note', text: 'note' }, MON);
  await addItem(db, { kind: 'task', text: 'today' }, TUE);

  const candidates = await listMigrationCandidates(db, '2026-10-06');
  expect(candidates.map((c) => c.id)).toEqual([open.id]);
});

test('deleteItem: 행은 남기고 deleted_at만 찍으며 목록에서 빠진다', async () => {
  const item = await addItem(db, { kind: 'note', text: 'a' }, MON);
  await db.runAsync('DELETE FROM outbox', []);
  await deleteItem(db, item.id, TUE);
  expect(await listItemsForDate(db, '2026-10-05')).toHaveLength(0);
  expect(await db.getFirstAsync('SELECT deleted_at FROM items WHERE id = ?', [item.id])).toEqual({
    deleted_at: TUE.toISOString(),
  });
  expect(await outboxKeys()).toEqual([item.id]);
});
