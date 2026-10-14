import type { Db, Tx } from '../db/types';
import { addDays, logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

export type ItemKind = 'task' | 'note';
// dropped: 안 하기로 한 일. 지우지 않고 줄을 그어 남긴다(끝낸 일로 세지 않는다)
export type TaskStatus = 'open' | 'doing' | 'done' | 'migrated' | 'dropped';

export type Item = {
  id: string;
  date: string;
  kind: ItemKind;
  text: string;
  status: TaskStatus | null;
  priority: boolean;
  migrated_from: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ItemRow = Omit<Item, 'priority'> & { priority: number };

export const MAX_PRIORITY_PER_DAY = 3;
export const MAX_TEXT = 200; // 한 줄에 쓸 수 있는 글자 수
// 안 하기로 한 일은 기호를 누르면 다시 할 일로 돌아온다
const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = { open: 'doing', doing: 'done', done: 'open', dropped: 'open' };
const COLUMNS = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
// 종이 다이어리처럼 적은 순서 그대로. 상태를 바꾸거나 형광펜을 칠해도 줄이 자리를 옮기지 않는다
const ORDER = 'created_at, id';

const toItem = (row: ItemRow): Item => ({ ...row, priority: row.priority === 1 });

async function insertItem(tx: Tx, item: Item): Promise<void> {
  await tx.runAsync(`INSERT INTO items (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id,
    item.date,
    item.kind,
    item.text,
    item.status,
    item.priority ? 1 : 0,
    item.migrated_from,
    item.created_at,
    item.updated_at,
    item.deleted_at,
  ]);
  await markDirty(tx, 'items', item.id);
}

async function requireItem(tx: Tx, id: string): Promise<Item> {
  const row = await tx.getFirstAsync<ItemRow>(`SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new Error(`항목을 찾을 수 없습니다: ${id}`);
  return toItem(row);
}

async function update(tx: Tx, id: string, fields: { status?: TaskStatus; priority?: boolean }, now: Date) {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (fields.status !== undefined) {
    sets.push('status = ?');
    params.push(fields.status);
  }
  if (fields.priority !== undefined) {
    sets.push('priority = ?');
    params.push(fields.priority ? 1 : 0);
  }
  await tx.runAsync(`UPDATE items SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...params,
    now.toISOString(),
    id,
  ]);
  await markDirty(tx, 'items', id);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// addDays(date, 0) !== date: 2026-02-30처럼 없는 날짜를 거른다.
const isDate = (date: string) => DATE_RE.test(date) && addDays(date, 0) === date;

export async function addItem(
  db: Db,
  input: { kind: ItemKind; text: string; date?: string },
  now = new Date(),
): Promise<Item> {
  if (input.kind !== 'task' && input.kind !== 'note') throw new Error('알 수 없는 종류입니다');
  const text = input.text.trim();
  if (!text) throw new Error('내용을 입력하세요');
  const today = logicalDate(now);
  const date = input.date ?? today;
  if (!isDate(date)) throw new Error('날짜 형식이 아닙니다');
  if (date < today) throw new Error('지난 날짜에는 넣을 수 없어요');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(),
    date,
    kind: input.kind,
    text,
    status: input.kind === 'task' ? 'open' : null,
    priority: false,
    migrated_from: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.transaction((tx) => insertItem(tx, item));
  return item;
}

// 다른 목록(언젠가)에서 오늘 장으로 옮겨 적을 때. 부르는 쪽 트랜잭션 안에서 열린 할 일 한 줄을 만든다
export async function insertTaskInTx(tx: Tx, text: string, date: string, now: Date): Promise<Item> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('내용을 입력하세요');
  if (!isDate(date)) throw new Error('날짜 형식이 아닙니다');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(),
    date,
    kind: 'task',
    text: trimmed,
    status: 'open',
    priority: false,
    migrated_from: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await insertItem(tx, item);
  return item;
}

export async function advanceStatus(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    const next = item.status ? NEXT_STATUS[item.status] : undefined;
    if (!next) throw new Error('상태를 바꿀 수 없는 항목입니다');
    await update(tx, id, { status: next }, now);
  });
}

export async function setPriority(db: Db, id: string, on: boolean, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.kind !== 'task') throw new Error('메모에는 중요 표시를 할 수 없습니다');
    if (on && !item.priority) {
      const row = await tx.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM items WHERE date = ? AND priority = 1 AND deleted_at IS NULL
           AND status IN ('open', 'doing') AND id != ?`,
        [item.date, id],
      );
      if ((row?.n ?? 0) >= MAX_PRIORITY_PER_DAY) throw new Error('중요는 하루 3개까지예요');
    }
    await update(tx, id, { priority: on }, now);
  });
}

async function migrateInTx(tx: Tx, id: string, target: (today: string) => string, now: Date): Promise<Item> {
  const ts = now.toISOString();
  const item = await requireItem(tx, id);
  if (item.status !== 'open' && item.status !== 'doing') throw new Error('끝나지 않은 할 일만 옮길 수 있습니다');
  const today = logicalDate(now);
  const dest = target(today);
  if (!isDate(dest)) throw new Error('날짜 형식이 아닙니다');
  // 지난 일은 오늘·앞날로, 오늘 일은 앞날로. 같은 날이나 더 앞 날짜로는 옮기지 않는다
  if (item.date >= dest) throw new Error('이전 날짜의 할 일만 옮길 수 있습니다');
  if (dest < today) throw new Error('지난 날짜로는 옮길 수 없어요');
  await update(tx, id, { status: 'migrated' }, now);
  const created: Item = {
    ...item,
    id: newId(),
    date: dest,
    status: 'open',
    priority: false,
    migrated_from: item.id,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await insertItem(tx, created);
  return created;
}

function migrateTo(db: Db, id: string, target: (today: string) => string, now: Date): Promise<Item> {
  return db.transaction((tx) => migrateInTx(tx, id, target, now));
}

export function migrateToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateTo(db, id, (today) => today, now);
}

// 포스트잇의 '모두 오늘 하기'. 하나라도 못 옮기면 아무것도 옮기지 않는다.
export function migrateAllToToday(db: Db, ids: string[], now = new Date()): Promise<Item[]> {
  return db.transaction(async (tx) => {
    const created: Item[] = [];
    for (const id of ids) created.push(await migrateInTx(tx, id, (today) => today, now));
    return created;
  });
}

// 날짜를 골라 미루기(퓨처 로그). 오늘보다 뒤, 원래 날짜보다 뒤인 날만. 그날이 오면 그날 장에 그냥 보인다
export function migrateToDate(db: Db, id: string, date: string, now = new Date()): Promise<Item> {
  return migrateTo(
    db,
    id,
    (today) => {
      if (isDate(date) && date <= today) throw new Error('오늘 뒤의 날짜로만 미룰 수 있어요');
      return date;
    },
    now,
  );
}

// 포스트잇의 '내일로 넘기기'(한 번에)
export function migrateToTomorrow(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateToDate(db, id, addDays(logicalDate(now), 1), now);
}

// 안 하기: 끝나지 않은 할 일에 줄을 긋는다. 되돌리기·다시 하기를 위해 바꾸기 전 상태를 돌려준다
export async function dropItem(db: Db, id: string, now = new Date()): Promise<'open' | 'doing'> {
  return db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.status !== 'open' && item.status !== 'doing') throw new Error('끝나지 않은 할 일만 안 하기로 할 수 있어요');
    await update(tx, id, { status: 'dropped' }, now);
    return item.status;
  });
}

// 안 하기를 바로 '되돌리기'했을 때: 줄 긋기 전 상태(할 일·진행 중)로
export async function undoDrop(db: Db, id: string, prevStatus: 'open' | 'doing', now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.status !== 'dropped') throw new Error('안 하기로 한 일이 아니라 되돌릴 수 없습니다');
    await update(tx, id, { status: prevStatus }, now);
  });
}

// 미루고 바로 '되돌리기'를 눌렀을 때. 옮겨 만든 줄은 지우고, 원래 줄은 미루기 전 상태(open·doing)로 돌린다.
export async function undoMigration(
  db: Db,
  createdId: string,
  prevStatus: 'open' | 'doing',
  now = new Date(),
): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    const created = await tx.getFirstAsync<ItemRow>(
      `SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`,
      [createdId],
    );
    if (!created?.migrated_from) throw new Error(`되돌릴 옮긴 일을 찾을 수 없습니다: ${createdId}`);
    const source = await tx.getFirstAsync<ItemRow>(
      `SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`,
      [created.migrated_from],
    );
    if (!source || source.status !== 'migrated') throw new Error('원래 할 일이 옮긴 상태가 아니라 되돌릴 수 없습니다');
    await tx.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, createdId]);
    await markDirty(tx, 'items', createdId);
    await update(tx, source.id, { status: prevStatus }, now);
  });
}

export async function updateItemText(db: Db, id: string, text: string, now = new Date()): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('내용을 입력하세요');
  if (Array.from(trimmed).length > MAX_TEXT) throw new Error(`${MAX_TEXT}자까지 쓸 수 있어요`);
  await db.transaction(async (tx) => {
    await requireItem(tx, id);
    await tx.runAsync('UPDATE items SET text = ?, updated_at = ? WHERE id = ?', [trimmed, now.toISOString(), id]);
    await markDirty(tx, 'items', id);
  });
}

export async function deleteItem(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    await requireItem(tx, id);
    await tx.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(tx, 'items', id);
  });
}

// 지운 항목을 되살린다(지우고 바로 '되돌리기'를 눌렀을 때).
export async function restoreItem(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM items WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    if (!row) throw new Error(`되돌릴 항목을 찾을 수 없습니다: ${id}`);
    await tx.runAsync('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?', [now.toISOString(), id]);
    await markDirty(tx, 'items', id);
  });
}

export async function listItemsForDate(db: Db, date: string): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${COLUMNS} FROM items WHERE date = ? AND deleted_at IS NULL ORDER BY ${ORDER}`,
    [date],
  );
  return rows.map(toItem);
}

export async function listMigrationCandidates(db: Db, today: string): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${COLUMNS} FROM items
     WHERE kind = 'task' AND status IN ('open', 'doing') AND date < ? AND deleted_at IS NULL
     ORDER BY date, created_at`,
    [today],
  );
  return rows.map(toItem);
}
