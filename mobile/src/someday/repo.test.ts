import { openTestDb } from '../../test/sqlite';
import { listMonthSummary } from '../archive/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { listItemsForDate, listMigrationCandidates } from '../items/repo';
import { countRecordedDays } from '../stats/recordedDays';
import {
  addSomeday,
  advanceSomeday,
  deleteSomeday,
  dropSomeday,
  listSomeday,
  moveSomeday,
  moveSomedayToToday,
  restoreSomeday,
  type Someday,
  setSomedayPriority,
  sortSomeday,
  undoDropSomeday,
  undoMoveSomeday,
  updateSomedayText,
} from './repo';

const MON = new Date(2026, 9, 5, 9, 0); // 2026-10-05
const TUE = new Date(2026, 9, 6, 9, 0); // 2026-10-06

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const outbox = async (table: string) =>
  (await db.getAllAsync<{ row_key: string }>('SELECT row_key FROM outbox WHERE table_name = ?', [table])).map((r) => r.row_key).sort();
const statusOf = async (id: string) => (await listSomeday(db)).find((s) => s.id === id)?.status;

test('addSomeday: 열린 줄로 저장하고 outbox에 오른다. 빈 글·너무 긴 글은 거부한다', async () => {
  const s = await addSomeday(db, '  읽을 책 정리 ', MON);
  expect(s).toMatchObject({ text: '읽을 책 정리', status: 'open', priority: false, migrated_to: null });
  expect(await outbox('someday')).toEqual([s.id]);
  await expect(addSomeday(db, '   ', MON)).rejects.toThrow('내용을 입력하세요');
  await expect(addSomeday(db, 'ㄱ'.repeat(201), MON)).rejects.toThrow('200자까지');
});

test('listSomeday: 적은 순서 그대로(새 줄은 맨 뒤에, 기기 시계와 상관없이), 지운 줄은 빼고', async () => {
  const a = await addSomeday(db, 'a', MON);
  const b = await addSomeday(db, 'b', TUE);
  const c = await addSomeday(db, 'c', new Date(2026, 9, 4));
  await deleteSomeday(db, b.id, TUE);
  expect((await listSomeday(db)).map((s) => s.id)).toEqual([a.id, c.id]);
  expect(c.position).toBe(3); // 지운 줄의 자리값도 건너뛴다
});

test('listSomeday: 자리값이 없는 줄(예전 앱·서버에서 받은 줄)은 맨 뒤에 적은 순서대로', async () => {
  const a = await addSomeday(db, 'a', TUE);
  await db.runAsync(
    "INSERT INTO someday (id, text, status, created_at, updated_at) VALUES ('old2', 'x', 'open', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z')",
    [],
  );
  await db.runAsync(
    "INSERT INTO someday (id, text, status, created_at, updated_at) VALUES ('old1', 'x', 'open', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')",
    [],
  );
  expect((await listSomeday(db)).map((s) => s.id)).toEqual([a.id, 'old1', 'old2']);
});

describe('moveSomeday', () => {
  const ids = async () => (await listSomeday(db)).map((s) => s.text);
  const dirty = async () =>
    (await db.getAllAsync<{ row_key: string }>("SELECT row_key FROM outbox WHERE table_name = 'someday' ORDER BY row_key", [])).map(
      (r) => r.row_key,
    );

  test('끝내지 않은 줄 사이에서 옮기고, 옮긴 줄만 새 자리값(이웃의 가운데)을 받아 outbox에 오른다', async () => {
    await addSomeday(db, 'a', MON);
    await addSomeday(db, 'b', MON);
    const c = await addSomeday(db, 'c', MON);
    await db.runAsync('DELETE FROM outbox', []);
    await moveSomeday(db, c.id, 0, TUE);
    expect(await ids()).toEqual(['c', 'a', 'b']);
    await moveSomeday(db, c.id, 1, TUE);
    expect(await ids()).toEqual(['a', 'c', 'b']);
    const rows = await listSomeday(db);
    expect(rows.find((r) => r.id === c.id)).toMatchObject({ position: 1.5, updated_at: TUE.toISOString() });
    expect(await dirty()).toEqual([c.id]);
  });

  test('끝낸 줄은 끌 수 없고, 자리 셈에도 들지 않는다(화면 아래에 따로 모이므로)', async () => {
    await addSomeday(db, 'a', MON);
    const done = await addSomeday(db, 'done', MON);
    const c = await addSomeday(db, 'c', MON);
    await advanceSomeday(db, done.id, MON);
    await expect(moveSomeday(db, done.id, 0, TUE)).rejects.toThrow('끝낸 일은 옮길 수 없어요');
    // 끝내지 않은 줄은 a, c 둘. c를 맨 앞(0)으로
    await moveSomeday(db, c.id, 0, TUE);
    expect(sortSomeday(await listSomeday(db)).map((r) => r.text)).toEqual(['c', 'a', 'done']);
  });

  test('이웃 사이가 너무 좁으면 끝내지 않은 줄을 모두 1, 2, 3…으로 다시 매기고 모두 outbox에 오른다', async () => {
    const a = await addSomeday(db, 'a', MON);
    const b = await addSomeday(db, 'b', MON);
    const c = await addSomeday(db, 'c', MON);
    await db.runAsync('UPDATE someday SET position = ? WHERE id = ?', [1 + 1e-7, b.id]);
    await db.runAsync('DELETE FROM outbox', []);
    await moveSomeday(db, c.id, 1, TUE); // a(1)와 b(1.0000001) 사이
    expect(await ids()).toEqual(['a', 'c', 'b']);
    expect((await listSomeday(db)).map((r) => r.position)).toEqual([1, 2, 3]);
    expect(await dirty()).toEqual([a.id, b.id, c.id].sort());
  });
});

test('advanceSomeday: 할 일 → 끝낸 일 → 할 일, 안 하기는 다시 할 일로. 옮긴 일은 바꿀 수 없다', async () => {
  const s = await addSomeday(db, 'a', MON);
  await advanceSomeday(db, s.id, MON);
  expect(await statusOf(s.id)).toBe('done');
  await advanceSomeday(db, s.id, MON);
  expect(await statusOf(s.id)).toBe('open');
  await dropSomeday(db, s.id, MON);
  await advanceSomeday(db, s.id, MON);
  expect(await statusOf(s.id)).toBe('open');
  await moveSomedayToToday(db, s.id, MON);
  await expect(advanceSomeday(db, s.id, MON)).rejects.toThrow('상태를 바꿀 수 없는');
});

test('setSomedayPriority: 개수 제한이 없고, 끝낸 일에는 칠하지 않는다', async () => {
  const rows: Someday[] = [];
  for (let i = 0; i < 5; i++) rows.push(await addSomeday(db, `s${i}`, MON));
  for (const r of rows) await setSomedayPriority(db, r.id, true, MON);
  expect((await listSomeday(db)).every((s) => s.priority)).toBe(true);
  await setSomedayPriority(db, rows[0].id, false, MON);
  expect((await listSomeday(db)).find((s) => s.id === rows[0].id)?.priority).toBe(false);
  await advanceSomeday(db, rows[0].id, MON);
  await expect(setSomedayPriority(db, rows[0].id, true, MON)).rejects.toThrow('끝나지 않은 일에만');
});

test('updateSomedayText: 글을 고치고 updated_at을 올린다', async () => {
  const s = await addSomeday(db, 'a', MON);
  await updateSomedayText(db, s.id, ' 바뀐 글 ', TUE);
  expect((await listSomeday(db))[0]).toMatchObject({ text: '바뀐 글', updated_at: TUE.toISOString() });
  await expect(updateSomedayText(db, s.id, ' ', TUE)).rejects.toThrow('내용을 입력하세요');
});

test('dropSomeday / undoDropSomeday: 줄을 긋고 되돌린다. 열린 줄만 안 하기로 할 수 있다', async () => {
  const s = await addSomeday(db, 'a', MON);
  await dropSomeday(db, s.id, MON);
  expect(await statusOf(s.id)).toBe('dropped');
  await expect(dropSomeday(db, s.id, MON)).rejects.toThrow('끝나지 않은 일만');
  await undoDropSomeday(db, s.id, MON);
  expect(await statusOf(s.id)).toBe('open');
  await expect(undoDropSomeday(db, s.id, MON)).rejects.toThrow('되돌릴 수 없습니다');
});

test('deleteSomeday / restoreSomeday: 지운 줄을 되살린다', async () => {
  const s = await addSomeday(db, 'a', MON);
  await deleteSomeday(db, s.id, MON);
  expect(await listSomeday(db)).toEqual([]);
  await restoreSomeday(db, s.id, TUE);
  expect(await listSomeday(db)).toMatchObject([{ id: s.id, deleted_at: null }]);
  await expect(restoreSomeday(db, s.id, TUE)).rejects.toThrow('되돌릴 항목을 찾을 수 없습니다');
});

test('moveSomedayToToday: 한 트랜잭션에서 오늘 장에 같은 글의 할 일을 만들고 이 줄은 옮긴 일로 남긴다', async () => {
  const s = await addSomeday(db, '치과 예약', MON);
  // 새벽 3시는 전날(논리 날짜) 장에 적는다
  const created = await moveSomedayToToday(db, s.id, new Date(2026, 9, 6, 3, 0));
  expect(created).toMatchObject({ date: '2026-10-05', kind: 'task', text: '치과 예약', status: 'open', priority: false });
  expect(await listItemsForDate(db, '2026-10-05')).toMatchObject([{ id: created.id }]);
  expect((await listSomeday(db))[0]).toMatchObject({ status: 'migrated', migrated_to: created.id });
  expect(await outbox('items')).toEqual([created.id]);
  expect(await outbox('someday')).toEqual([s.id]);
  await expect(moveSomedayToToday(db, s.id, MON)).rejects.toThrow('끝나지 않은 일만');
});

test('moveSomedayToToday: 실패하면 아무것도 바뀌지 않는다', async () => {
  const s = await addSomeday(db, 'a', MON);
  await advanceSomeday(db, s.id, MON); // done
  await expect(moveSomedayToToday(db, s.id, MON)).rejects.toThrow();
  expect(await listItemsForDate(db, '2026-10-05')).toEqual([]);
  expect(await statusOf(s.id)).toBe('done');
});

test('undoMoveSomeday: 오늘 장에 만든 줄을 지우고 이 줄을 다시 할 일로', async () => {
  const s = await addSomeday(db, 'a', MON);
  const created = await moveSomedayToToday(db, s.id, MON);
  await undoMoveSomeday(db, s.id, MON);
  expect(await listItemsForDate(db, '2026-10-05')).toEqual([]);
  expect((await listSomeday(db))[0]).toMatchObject({ status: 'open', migrated_to: null });
  expect(await outbox('items')).toEqual([created.id]);
  await expect(undoMoveSomeday(db, s.id, MON)).rejects.toThrow('되돌릴 수 없습니다');
});

test('언젠가 줄은 넘어온 일·달력 요약·기록한 날에 섞이지 않는다', async () => {
  await addSomeday(db, 'a', MON);
  const b = await addSomeday(db, 'b', MON);
  await advanceSomeday(db, b.id, MON);
  expect(await listMigrationCandidates(db, '2026-10-06')).toEqual([]);
  expect(await listItemsForDate(db, '2026-10-05')).toEqual([]);
  expect(await listMonthSummary(db, '2026-10')).toEqual([]);
  expect(await countRecordedDays(db, '2026-10-06')).toBe(0);
});

test('sortSomeday: 끝낸 줄만 아래로, 나머지는 적은 순서 그대로', () => {
  const r = (id: string, status: 'open' | 'done' | 'migrated' | 'dropped') => ({ id, status });
  expect(sortSomeday([r('a', 'done'), r('b', 'open'), r('c', 'migrated'), r('d', 'done'), r('e', 'dropped')]).map((x) => x.id)).toEqual([
    'b', 'c', 'e', 'a', 'd',
  ]);
});
