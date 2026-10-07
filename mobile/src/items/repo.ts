import type { Db, Tx } from '../db/types';
import { addDays, logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

export type ItemKind = 'task' | 'note';
export type TaskStatus = 'open' | 'doing' | 'done' | 'migrated';

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
const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = { open: 'doing', doing: 'done', done: 'open' };
const COLUMNS = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
// 진행 중 → 중요 → 나머지(입력 순) → 끝냄·옮김
const ORDER = `CASE WHEN status = 'doing' THEN 0 WHEN status IN ('done', 'migrated') THEN 3
  WHEN priority = 1 THEN 1 ELSE 2 END, created_at`;

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

export async function addItem(db: Db, input: { kind: ItemKind; text: string }, now = new Date()): Promise<Item> {
  if (input.kind !== 'task' && input.kind !== 'note') throw new Error('알 수 없는 종류입니다');
  const text = input.text.trim();
  if (!text) throw new Error('내용을 입력하세요');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(),
    date: logicalDate(now),
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

async function migrateTo(db: Db, id: string, target: (today: string) => string, now: Date): Promise<Item> {
  const ts = now.toISOString();
  return db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.status !== 'open' && item.status !== 'doing') throw new Error('끝나지 않은 할 일만 옮길 수 있습니다');
    const today = logicalDate(now);
    if (item.date >= today) throw new Error('이전 날짜의 할 일만 옮길 수 있습니다');
    await update(tx, id, { status: 'migrated' }, now);
    const created: Item = {
      ...item,
      id: newId(),
      date: target(today),
      status: 'open',
      priority: false,
      migrated_from: item.id,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    await insertItem(tx, created);
    return created;
  });
}

export function migrateToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateTo(db, id, (today) => today, now);
}

export function migrateToTomorrow(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateTo(db, id, (today) => addDays(today, 1), now);
}

export async function deleteItem(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    await requireItem(tx, id);
    await tx.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
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
