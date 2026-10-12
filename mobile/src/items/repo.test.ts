import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import {
  addItem,
  advanceStatus,
  deleteItem,
  listItemsForDate,
  listMigrationCandidates,
  migrateAllToToday,
  migrateToToday,
  migrateToTomorrow,
  restoreItem,
  setPriority,
  updateItemText,
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
  expect(item).toMatchObject({ date: '2026-10-05', kind: 'task', text: '보고서 쓰기', status: 'open', priority: false });
  expect(await listItemsForDate(db, '2026-10-05')).toHaveLength(1);
  expect(await outboxKeys()).toEqual([item.id]);
});

test('addItem: 메모는 status가 없다', async () => {
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

test('migrateToToday: 원래 항목은 migrated, 오늘 날짜로 연결된 새 할 일이 생긴다', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  const created = await migrateToToday(db, old.id, TUE);

  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
  expect(created).toMatchObject({ date: '2026-10-06', text: '운동', status: 'open', migrated_from: old.id });
  expect(created.id).not.toBe(old.id);
  expect((await outboxKeys()).sort()).toEqual([old.id, created.id].sort());
});

test('migrateToToday: 끝나지 않은 할 일이 아니면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await advanceStatus(db, item.id, MON);
  await advanceStatus(db, item.id, MON); // done
  await expect(migrateToToday(db, item.id, TUE)).rejects.toThrow('끝나지 않은 할 일만');
});

test('listMigrationCandidates: 오늘 이전의 열린 할 일만, 삭제된 것은 빼고 돌려준다', async () => {
  const open = await addItem(db, { kind: 'task', text: 'open' }, MON);
  const done = await addItem(db, { kind: 'task', text: 'done' }, MON);
  await advanceStatus(db, done.id, MON);
  await advanceStatus(db, done.id, MON);
  const deleted = await addItem(db, { kind: 'task', text: 'deleted' }, MON);
  await deleteItem(db, deleted.id, MON);
  await addItem(db, { kind: 'note', text: 'note' }, MON);
  await addItem(db, { kind: 'task', text: 'today' }, TUE);
  const migrated = await addItem(db, { kind: 'task', text: 'migrated' }, MON);
  await migrateToToday(db, migrated.id, TUE);

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

test('migrateToToday: 오늘 날짜의 할 일은 거부하고 open으로 남긴다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  await expect(migrateToToday(db, item.id, TUE)).rejects.toThrow('이전 날짜의 할 일만');
  expect((await listItemsForDate(db, '2026-10-06'))[0].status).toBe('open');
});

test('삭제된 항목을 바꾸려 하면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await deleteItem(db, item.id, MON);
  await expect(advanceStatus(db, item.id, MON)).rejects.toThrow('항목을 찾을 수 없습니다');
});

test('advanceStatus: 할 일 → 진행 중 → 끝냄 → 할 일', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  const statusOf = async () => (await listItemsForDate(db, '2026-10-05'))[0].status;
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('doing');
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('done');
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('open');
});

test('advanceStatus: 메모는 거부한다', async () => {
  const note = await addItem(db, { kind: 'note', text: 'n' }, MON);
  await expect(advanceStatus(db, note.id, MON)).rejects.toThrow('상태를 바꿀 수 없는');
});

test('setPriority: 같은 날 안 끝낸 할 일 3개까지', async () => {
  const ids = [];
  for (const t of ['a', 'b', 'c', 'd']) ids.push((await addItem(db, { kind: 'task', text: t }, MON)).id);
  for (const id of ids.slice(0, 3)) await setPriority(db, id, true, MON);
  await expect(setPriority(db, ids[3], true, MON)).rejects.toThrow('하루 3개까지');
  await advanceStatus(db, ids[0], MON);
  await advanceStatus(db, ids[0], MON); // done → 자리가 빈다
  await expect(setPriority(db, ids[3], true, MON)).resolves.toBeUndefined();
});

test('setPriority: 메모는 거부, 끄기는 언제나 된다', async () => {
  const note = await addItem(db, { kind: 'note', text: 'n' }, MON);
  await expect(setPriority(db, note.id, true, MON)).rejects.toThrow('메모');
  const t = await addItem(db, { kind: 'task', text: 't' }, MON);
  await setPriority(db, t.id, true, MON);
  await setPriority(db, t.id, false, MON);
  expect((await listItemsForDate(db, '2026-10-05')).find((i) => i.id === t.id)?.priority).toBe(false);
});

test('listItemsForDate 정렬: 진행 중 → 중요 → 나머지 → 끝냄', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 5, 9, 0));
  await addItem(db, { kind: 'task', text: 'b' }, new Date(2026, 9, 5, 9, 1));
  await addItem(db, { kind: 'note', text: 'c' }, new Date(2026, 9, 5, 9, 2));
  const d = await addItem(db, { kind: 'task', text: 'd' }, new Date(2026, 9, 5, 9, 3));
  const e = await addItem(db, { kind: 'task', text: 'e' }, new Date(2026, 9, 5, 9, 4));
  await advanceStatus(db, a.id, MON);
  await advanceStatus(db, a.id, MON); // a: done
  await advanceStatus(db, e.id, MON); // e: doing
  await setPriority(db, d.id, true, MON); // d: 중요
  expect((await listItemsForDate(db, '2026-10-05')).map((i) => i.text)).toEqual(['e', 'd', 'b', 'c', 'a']);
});

test('listItemsForDate 정렬: 진행 중 안에서도, 할 일 안에서도 중요가 먼저', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 5, 9, 0));
  const b = await addItem(db, { kind: 'task', text: 'b' }, new Date(2026, 9, 5, 9, 1));
  await addItem(db, { kind: 'task', text: 'c' }, new Date(2026, 9, 5, 9, 2));
  const d = await addItem(db, { kind: 'task', text: 'd' }, new Date(2026, 9, 5, 9, 3));
  await advanceStatus(db, a.id, MON); // a: doing
  await advanceStatus(db, b.id, MON); // b: doing
  await setPriority(db, b.id, true, MON); // b: doing + 중요
  await setPriority(db, d.id, true, MON); // d: open + 중요
  expect((await listItemsForDate(db, '2026-10-05')).map((i) => i.text)).toEqual(['b', 'a', 'd', 'c']);
});

test('migrateToTomorrow: 원래는 migrated, 내일 날짜로 새 할 일', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  await setPriority(db, old.id, true, MON);
  const created = await migrateToTomorrow(db, old.id, TUE);
  expect(created).toMatchObject({ date: '2026-10-07', status: 'open', priority: false, migrated_from: old.id });
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
});

test('listMigrationCandidates: 진행 중이던 지난 할 일도 포함', async () => {
  const doing = await addItem(db, { kind: 'task', text: 'doing' }, MON);
  await advanceStatus(db, doing.id, MON);
  expect((await listMigrationCandidates(db, '2026-10-06')).map((c) => c.id)).toEqual([doing.id]);
});

test('addItem: 일정 종류는 거부한다', async () => {
  await expect(addItem(db, { kind: 'event' as never, text: 'x' }, MON)).rejects.toThrow('종류');
});

test('addItem: 날짜를 주면 그 날짜에 넣는다(오늘 이후만)', async () => {
  const item = await addItem(db, { kind: 'task', text: '치과 전화', date: '2026-10-06' }, MON);
  expect(item.date).toBe('2026-10-06');
  await expect(addItem(db, { kind: 'task', text: 'x', date: '2026-10-04' }, MON)).rejects.toThrow('지난 날짜');
  await expect(addItem(db, { kind: 'task', text: 'x', date: '10월 6일' }, MON)).rejects.toThrow('날짜');
});

test('addItem: 날짜를 줘도 created_at은 now에서 정하고, 없는 날짜는 거절한다', async () => {
  const item = await addItem(db, { kind: 'note', text: '메모', date: '2026-10-20' }, MON);
  expect(item.created_at).toBe(MON.toISOString());
  expect(item.updated_at).toBe(MON.toISOString());
  await expect(addItem(db, { kind: 'task', text: 'x', date: '2026-02-30' }, MON)).rejects.toThrow('날짜 형식');
  await expect(addItem(db, { kind: 'task', text: 'x', date: '2026-10-5' }, MON)).rejects.toThrow('날짜 형식');
});

test('updateItemText: 앞뒤 공백을 지우고 고치며 outbox에 오른다', async () => {
  const item = await addItem(db, { kind: 'task', text: '장보기' }, MON);
  await db.runAsync('DELETE FROM outbox', []);
  await updateItemText(db, item.id, '  우유 사기 ', TUE);
  const row = await db.getFirstAsync<{ text: string; updated_at: string }>('SELECT text, updated_at FROM items WHERE id = ?', [item.id]);
  expect(row).toEqual({ text: '우유 사기', updated_at: TUE.toISOString() });
  expect(await outboxKeys()).toEqual([item.id]);
});

test('updateItemText: 빈 글, 200자 넘는 글, 지운 항목은 거부한다', async () => {
  const item = await addItem(db, { kind: 'note', text: 'a' }, MON);
  await expect(updateItemText(db, item.id, '   ', MON)).rejects.toThrow('내용을 입력하세요');
  await expect(updateItemText(db, item.id, '가'.repeat(201), MON)).rejects.toThrow('200자까지');
  await updateItemText(db, item.id, '가'.repeat(200), MON);
  await deleteItem(db, item.id, MON);
  await expect(updateItemText(db, item.id, 'b', MON)).rejects.toThrow('항목을 찾을 수 없습니다');
});

test('restoreItem: 지운 항목이 목록에 돌아오고 updated_at이 새로 찍히며 outbox에 오른다', async () => {
  const item = await addItem(db, { kind: 'task', text: '운동' }, MON);
  await deleteItem(db, item.id, MON);
  await db.runAsync('DELETE FROM outbox', []);
  await restoreItem(db, item.id, TUE);
  expect((await listItemsForDate(db, '2026-10-05')).map((i) => i.id)).toEqual([item.id]);
  expect(await db.getFirstAsync('SELECT deleted_at, updated_at FROM items WHERE id = ?', [item.id])).toEqual({
    deleted_at: null,
    updated_at: TUE.toISOString(),
  });
  expect(await outboxKeys()).toEqual([item.id]);
});

test('restoreItem: 지우지 않은 항목이나 없는 항목은 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: '운동' }, MON);
  await expect(restoreItem(db, item.id, MON)).rejects.toThrow('되돌릴 항목을 찾을 수 없습니다');
  await expect(restoreItem(db, 'nope', MON)).rejects.toThrow('되돌릴 항목을 찾을 수 없습니다');
});

test('migrateAllToToday: 넘어온 일을 한 번에 오늘로 옮긴다', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, MON);
  const b = await addItem(db, { kind: 'task', text: 'b' }, MON);
  const created = await migrateAllToToday(db, [a.id, b.id], TUE);
  expect(created.map((c) => c.migrated_from)).toEqual([a.id, b.id]);
  expect((await listItemsForDate(db, '2026-10-06')).map((i) => i.text).sort()).toEqual(['a', 'b']);
  expect(await listMigrationCandidates(db, '2026-10-06')).toHaveLength(0);
});

test('migrateAllToToday: 하나라도 못 옮기면 모두 그대로 둔다', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, MON);
  const done = await addItem(db, { kind: 'task', text: 'b' }, MON);
  await advanceStatus(db, done.id, MON);
  await advanceStatus(db, done.id, MON);
  await expect(migrateAllToToday(db, [a.id, done.id], TUE)).rejects.toThrow('끝나지 않은 할 일만');
  expect(await listItemsForDate(db, '2026-10-06')).toHaveLength(0);
  expect((await listMigrationCandidates(db, '2026-10-06')).map((c) => c.id)).toEqual([a.id]);
});
