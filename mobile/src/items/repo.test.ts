import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import {
  addItem,
  advanceStatus,
  completeOnItsDay,
  deleteItem,
  dropItem,
  listItemsForDate,
  listMigrationCandidates,
  migrateAllToToday,
  migrateToDate,
  migrateToToday,
  moveItem,
  reopen,
  restoreItem,
  setPriority,
  undoDrop,
  undoMigration,
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

test('listItemsForDate: 상태를 바꾸거나 형광펜을 칠해도 적은 순서 그대로', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 5, 9, 0));
  await addItem(db, { kind: 'task', text: 'b' }, new Date(2026, 9, 5, 9, 1));
  await addItem(db, { kind: 'note', text: 'c' }, new Date(2026, 9, 5, 9, 2));
  const d = await addItem(db, { kind: 'task', text: 'd' }, new Date(2026, 9, 5, 9, 3));
  const e = await addItem(db, { kind: 'task', text: 'e' }, new Date(2026, 9, 5, 9, 4));
  await advanceStatus(db, a.id, MON);
  await advanceStatus(db, a.id, MON); // a: done
  await advanceStatus(db, e.id, MON); // e: doing
  await setPriority(db, d.id, true, MON); // d: 중요
  expect((await listItemsForDate(db, '2026-10-05')).map((i) => i.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
});

test('migrateToDate(내일): 원래는 migrated, 내일 날짜로 새 할 일', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  await setPriority(db, old.id, true, MON);
  const created = await migrateToDate(db, old.id, '2026-10-07', TUE);
  expect(created).toMatchObject({ date: '2026-10-07', status: 'open', priority: false, migrated_from: old.id });
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
});

test('migrateToDate(내일): 오늘 할 일도 내일로 미룰 수 있다(오늘 줄은 옮긴 일로 남는다)', async () => {
  const item = await addItem(db, { kind: 'task', text: '장보기' }, TUE);
  await advanceStatus(db, item.id, TUE); // 진행 중이어도 된다
  const created = await migrateToDate(db, item.id, '2026-10-07', TUE);
  expect(created).toMatchObject({ date: '2026-10-07', status: 'open', migrated_from: item.id });
  expect((await listItemsForDate(db, '2026-10-06')).map((i) => i.status)).toEqual(['migrated']);
  await expect(migrateToDate(db, created.id, '2026-10-07', TUE)).rejects.toThrow('이전 날짜의 할 일만');
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

test('undoMigration: 오늘 일을 내일로 미뤘다가 되돌리면 오늘 줄은 원래 상태로, 내일 줄은 사라진다', async () => {
  const item = await addItem(db, { kind: 'task', text: '장보기' }, TUE);
  const created = await migrateToDate(db, item.id, '2026-10-07', TUE);
  await db.runAsync('DELETE FROM outbox', []);
  const later = new Date(2026, 9, 6, 9, 5);
  await undoMigration(db, created.id, 'open', later);
  const today = await listItemsForDate(db, '2026-10-06');
  expect(today.map((i) => [i.id, i.status, i.updated_at])).toEqual([[item.id, 'open', later.toISOString()]]);
  expect(await listItemsForDate(db, '2026-10-07')).toEqual([]);
  expect((await outboxKeys()).sort()).toEqual([item.id, created.id].sort());
});

test('undoMigration: 진행 중이던 일은 진행 중으로 돌아간다', async () => {
  const item = await addItem(db, { kind: 'task', text: '보고서' }, TUE);
  await advanceStatus(db, item.id, TUE);
  const created = await migrateToDate(db, item.id, '2026-10-07', TUE);
  await undoMigration(db, created.id, 'doing', TUE);
  expect((await listItemsForDate(db, '2026-10-06')).map((i) => i.status)).toEqual(['doing']);
});

test('undoMigration: 두 번 되돌리거나 옮긴 일이 아니면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: '운동' }, TUE);
  const created = await migrateToDate(db, item.id, '2026-10-07', TUE);
  await undoMigration(db, created.id, 'open', TUE);
  await expect(undoMigration(db, created.id, 'open', TUE)).rejects.toThrow('되돌릴 옮긴 일을 찾을 수 없습니다');
  await expect(undoMigration(db, item.id, 'open', TUE)).rejects.toThrow('되돌릴 옮긴 일을 찾을 수 없습니다');
  await expect(undoMigration(db, 'nope', 'open', TUE)).rejects.toThrow('되돌릴 옮긴 일을 찾을 수 없습니다');
});

test('undoMigration: 원래 줄이 이미 옮긴 상태가 아니면 거부하고 아무것도 바꾸지 않는다', async () => {
  const item = await addItem(db, { kind: 'task', text: '운동' }, TUE);
  const created = await migrateToDate(db, item.id, '2026-10-07', TUE);
  await db.runAsync("UPDATE items SET status = 'open' WHERE id = ?", [item.id]);
  await expect(undoMigration(db, created.id, 'open', TUE)).rejects.toThrow('옮긴 상태가 아니라');
  expect((await listItemsForDate(db, '2026-10-07')).map((i) => i.id)).toEqual([created.id]);
});

test('migrateToDate: 고른 날로 옮기고, 그날이 오면 그날 목록에 보인다', async () => {
  const item = await addItem(db, { kind: 'task', text: '치과' }, TUE);
  const created = await migrateToDate(db, item.id, '2026-10-20', TUE);
  expect(created).toMatchObject({ date: '2026-10-20', status: 'open', migrated_from: item.id });
  expect((await listItemsForDate(db, '2026-10-06')).map((i) => i.status)).toEqual(['migrated']);
  expect((await listItemsForDate(db, '2026-10-20')).map((i) => i.text)).toEqual(['치과']);
  // 앞날짜 줄은 밀린 일(포스트잇)로 넘어오지 않는다
  expect(await listMigrationCandidates(db, '2026-10-06')).toEqual([]);
});

test('migrateToDate: 오늘·지난 날·없는 날짜·원래 날짜보다 앞은 거부하고 아무것도 바꾸지 않는다', async () => {
  const item = await addItem(db, { kind: 'task', text: '치과' }, TUE);
  await expect(migrateToDate(db, item.id, '2026-10-06', TUE)).rejects.toThrow('오늘 뒤의 날짜로만');
  await expect(migrateToDate(db, item.id, '2026-10-01', TUE)).rejects.toThrow('오늘 뒤의 날짜로만');
  await expect(migrateToDate(db, item.id, '2026-02-30', TUE)).rejects.toThrow('날짜 형식');
  await expect(migrateToDate(db, item.id, 'tomorrow', TUE)).rejects.toThrow('날짜 형식');
  // 앞날로 미뤄 둔 줄을 그보다 앞 날짜로는 옮기지 않는다
  const moved = await migrateToDate(db, item.id, '2026-10-20', TUE);
  await expect(migrateToDate(db, moved.id, '2026-10-10', TUE)).rejects.toThrow('이전 날짜의 할 일만');
  expect((await listItemsForDate(db, '2026-10-20')).map((i) => i.status)).toEqual(['open']);
});

test('migrateToDate: 새벽 4시 전에는 어제가 오늘이라 오늘 날짜로도 미룰 수 있다', async () => {
  const late = new Date(2026, 9, 7, 2, 0); // 수요일 새벽 2시 = 화요일
  const item = await addItem(db, { kind: 'task', text: '빨래' }, late);
  expect(item.date).toBe('2026-10-06');
  const created = await migrateToDate(db, item.id, '2026-10-07', late);
  expect(created.date).toBe('2026-10-07');
});

test('migrateToDate: 끝낸 일·안 하기로 한 일은 옮기지 않는다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  await dropItem(db, item.id, TUE);
  await expect(migrateToDate(db, item.id, '2026-10-20', TUE)).rejects.toThrow('끝나지 않은 할 일만');
});

test('dropItem: 할 일·진행 중을 안 하기로, 바꾸기 전 상태를 돌려주고 outbox에 오른다', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  const b = await addItem(db, { kind: 'task', text: 'b' }, TUE);
  await advanceStatus(db, b.id, TUE);
  await db.runAsync('DELETE FROM outbox', []);
  expect(await dropItem(db, a.id, TUE)).toBe('open');
  expect(await dropItem(db, b.id, TUE)).toBe('doing');
  expect((await listItemsForDate(db, '2026-10-06')).map((i) => i.status)).toEqual(['dropped', 'dropped']);
  expect((await outboxKeys()).sort()).toEqual([a.id, b.id].sort());
});

test('dropItem: 끝낸 일·옮긴 일·메모·이미 안 하기로 한 일은 거부한다', async () => {
  const done = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  await advanceStatus(db, done.id, TUE);
  await advanceStatus(db, done.id, TUE);
  const note = await addItem(db, { kind: 'note', text: 'n' }, TUE);
  const moved = await addItem(db, { kind: 'task', text: 'm' }, TUE);
  await migrateToDate(db, moved.id, '2026-10-07', TUE);
  const dropped = await addItem(db, { kind: 'task', text: 'd' }, TUE);
  await dropItem(db, dropped.id, TUE);
  for (const id of [done.id, note.id, moved.id, dropped.id]) {
    await expect(dropItem(db, id, TUE)).rejects.toThrow('끝나지 않은 할 일만');
  }
});

test('안 하기로 한 일은 기호를 누르면(advanceStatus) 다시 할 일로 돌아온다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  await dropItem(db, item.id, TUE);
  await advanceStatus(db, item.id, TUE);
  expect((await listItemsForDate(db, '2026-10-06'))[0].status).toBe('open');
});

test('undoDrop: 줄 긋기 전 상태로 돌리고, 안 하기로 한 일이 아니면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, TUE);
  await advanceStatus(db, item.id, TUE);
  const prev = await dropItem(db, item.id, TUE);
  await undoDrop(db, item.id, prev, TUE);
  expect((await listItemsForDate(db, '2026-10-06'))[0].status).toBe('doing');
  await expect(undoDrop(db, item.id, 'open', TUE)).rejects.toThrow('되돌릴 수 없습니다');
});

test('안 하기로 한 일은 밀린 일(포스트잇) 후보가 아니고 중요 개수에도 세지 않는다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await setPriority(db, item.id, true, MON);
  await dropItem(db, item.id, MON);
  expect(await listMigrationCandidates(db, '2026-10-06')).toEqual([]);
  for (const t of ['b', 'c', 'd']) {
    const other = await addItem(db, { kind: 'task', text: t }, MON);
    await expect(setPriority(db, other.id, true, MON)).resolves.toBeUndefined();
  }
});

test('completeOnItsDay: 넘어온 일을 원래 날짜에 끝낸 일로 남기고 포스트잇 후보에서 빠진다', async () => {
  const item = await addItem(db, { kind: 'task', text: '치과 예약' }, MON);
  await db.runAsync('DELETE FROM outbox', []);
  const prev = await completeOnItsDay(db, item.id, TUE);
  expect(prev).toBe('open');
  const [row] = await listItemsForDate(db, '2026-10-05');
  expect(row).toMatchObject({ id: item.id, date: '2026-10-05', status: 'done', updated_at: TUE.toISOString() });
  // 옮기지 않으니 오늘 장에는 아무것도 생기지 않는다
  expect(await listItemsForDate(db, '2026-10-06')).toEqual([]);
  expect(await listMigrationCandidates(db, '2026-10-06')).toEqual([]);
  expect(await outboxKeys()).toEqual([item.id]);
});

test('completeOnItsDay: 진행 중이던 일은 doing을 돌려주고, 되돌리면(reopen) 진행 중으로 돌아온다', async () => {
  const item = await addItem(db, { kind: 'task', text: '보고서' }, MON);
  await advanceStatus(db, item.id, MON);
  const prev = await completeOnItsDay(db, item.id, TUE);
  expect(prev).toBe('doing');
  await reopen(db, item.id, prev, TUE);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('doing');
  expect((await listMigrationCandidates(db, '2026-10-06')).map((c) => c.id)).toEqual([item.id]);
});

test('completeOnItsDay: 끝나지 않은 할 일이 아니면 거부하고 아무것도 바꾸지 않는다', async () => {
  const done = await addItem(db, { kind: 'task', text: 'done' }, MON);
  await advanceStatus(db, done.id, MON);
  await advanceStatus(db, done.id, MON);
  const note = await addItem(db, { kind: 'note', text: 'n' }, MON);
  const moved = await addItem(db, { kind: 'task', text: 'm' }, MON);
  await migrateToToday(db, moved.id, TUE);
  const dropped = await addItem(db, { kind: 'task', text: 'd' }, MON);
  await dropItem(db, dropped.id, MON);
  const before = await listItemsForDate(db, '2026-10-05');
  for (const id of [done.id, note.id, moved.id, dropped.id]) {
    await expect(completeOnItsDay(db, id, TUE)).rejects.toThrow('끝나지 않은 할 일만');
  }
  await expect(completeOnItsDay(db, 'nope', TUE)).rejects.toThrow('찾을 수 없습니다');
  expect(await listItemsForDate(db, '2026-10-05')).toEqual(before);
});

test('reopen: 끝낸 일이 아니면(두 번 되돌리기 등) 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await completeOnItsDay(db, item.id, TUE);
  await reopen(db, item.id, 'open', TUE);
  await expect(reopen(db, item.id, 'open', TUE)).rejects.toThrow('끝낸 일이 아니라');
  await deleteItem(db, item.id, TUE);
  await expect(reopen(db, item.id, 'open', TUE)).rejects.toThrow('찾을 수 없습니다');
});

describe('줄 순서(position)', () => {
  const texts = async (date: string) => (await listItemsForDate(db, date)).map((i) => i.text);
  const add = (text: string, now = TUE, date?: string) => addItem(db, { kind: 'task', text, date }, now);

  test('새 줄은 그날 장의 맨 뒤에 붙는다(날짜마다 따로, 1부터)', async () => {
    const a = await add('a');
    const b = await addItem(db, { kind: 'note', text: 'b' }, TUE);
    const other = await add('다음 날', TUE, '2026-10-07');
    expect([a.position, b.position, other.position]).toEqual([1, 2, 1]);
  });

  test('moveItem: 같은 날 안에서 옮기고, 옮긴 줄만 이웃 가운데 값을 받아 outbox에 오른다', async () => {
    await add('a');
    const b = await add('b');
    const c = await add('c');
    await db.runAsync('DELETE FROM outbox', []);
    const later = new Date(2026, 9, 6, 10, 0);
    await moveItem(db, c.id, 0, later);
    expect(await texts('2026-10-06')).toEqual(['c', 'a', 'b']);
    await moveItem(db, b.id, 1, later);
    expect(await texts('2026-10-06')).toEqual(['c', 'b', 'a']);
    const rows = await listItemsForDate(db, '2026-10-06');
    expect(rows.map((r) => r.position)).toEqual([0, 0.5, 1]);
    expect(rows[1].updated_at).toBe(later.toISOString());
    expect((await outboxKeys()).sort()).toEqual([b.id, c.id].sort());
  });

  test('moveItem: 맨 뒤로, 제자리는 아무것도 바꾸지 않는다, 목록 밖 자리는 끝에 맞춘다', async () => {
    const a = await add('a');
    await add('b');
    await db.runAsync('DELETE FROM outbox', []);
    await moveItem(db, a.id, 0, TUE);
    expect(await outboxKeys()).toEqual([]);
    await moveItem(db, a.id, 99, TUE);
    expect(await texts('2026-10-06')).toEqual(['b', 'a']);
    expect((await listItemsForDate(db, '2026-10-06'))[1].position).toBe(3);
  });

  test('moveItem: 다른 날 줄·지운 줄은 셈에 들지 않는다(같은 날 안에서만)', async () => {
    await add('a');
    const gone = await add('지움');
    const c = await add('c');
    await add('다음 날', TUE, '2026-10-07');
    await deleteItem(db, gone.id, TUE);
    await moveItem(db, c.id, 0, TUE);
    expect(await texts('2026-10-06')).toEqual(['c', 'a']);
    expect(await texts('2026-10-07')).toEqual(['다음 날']);
    await expect(moveItem(db, gone.id, 0, TUE)).rejects.toThrow('항목을 찾을 수 없습니다');
  });

  test('moveItem: 이웃 사이가 너무 좁으면 그날 줄을 모두 1, 2, 3…으로 다시 매기고 모두 outbox에 오른다', async () => {
    const a = await add('a');
    const b = await add('b');
    const c = await add('c');
    await add('다음 날', TUE, '2026-10-07');
    await db.runAsync('UPDATE items SET position = ? WHERE id = ?', [1 + 5e-7, b.id]);
    await db.runAsync('DELETE FROM outbox', []);
    await moveItem(db, c.id, 1, TUE);
    expect(await texts('2026-10-06')).toEqual(['a', 'c', 'b']);
    expect((await listItemsForDate(db, '2026-10-06')).map((r) => r.position)).toEqual([1, 2, 3]);
    expect((await outboxKeys()).sort()).toEqual([a.id, b.id, c.id].sort());
    expect((await listItemsForDate(db, '2026-10-07'))[0].position).toBe(1);
  });

  test('자리값이 없는 줄(예전 앱이 만든 줄)은 맨 뒤에 적은 순서대로, 그날을 옮기면 모두 다시 매긴다', async () => {
    await add('a');
    await db.runAsync(
      "INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES ('old', '2026-10-06', 'note', '예전', NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')",
      [],
    );
    expect(await texts('2026-10-06')).toEqual(['a', '예전']);
    await moveItem(db, 'old', 0, TUE);
    expect(await texts('2026-10-06')).toEqual(['예전', 'a']);
    expect((await listItemsForDate(db, '2026-10-06')).map((r) => r.position)).toEqual([1, 2]);
  });

  test('미루기·오늘로 옮기기로 만든 줄은 옮겨 간 날 장의 맨 뒤에 붙고, 되돌리기는 순서를 건드리지 않는다', async () => {
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, MON);
    await add('a');
    await add('b');
    const created = await migrateToToday(db, old.id, TUE);
    expect(await texts('2026-10-06')).toEqual(['a', 'b', '어제 일']);
    expect(created.position).toBe(3);
    const a = (await listItemsForDate(db, '2026-10-06'))[0];
    const moved = await migrateToDate(db, a.id, '2026-10-08', TUE);
    expect(moved.position).toBe(1);
    await undoMigration(db, moved.id, 'open', TUE);
    expect(await texts('2026-10-06')).toEqual(['a', 'b', '어제 일']);
  });
});
