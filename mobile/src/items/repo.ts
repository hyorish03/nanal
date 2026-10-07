import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

export type ItemKind = 'task' | 'event' | 'note';
export type TaskStatus = 'open' | 'done' | 'migrated' | 'dropped';

export type Item = {
  id: string;
  date: string;
  kind: ItemKind;
  text: string;
  status: TaskStatus | null;
  migrated_from: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = 'id, date, kind, text, status, migrated_from, created_at, updated_at, deleted_at';

async function insertItem(db: Db, item: Item): Promise<void> {
  await db.runAsync(`INSERT INTO items (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id,
    item.date,
    item.kind,
    item.text,
    item.status,
    item.migrated_from,
    item.created_at,
    item.updated_at,
    item.deleted_at,
  ]);
  await markDirty(db, 'items', item.id);
}

async function requireItem(db: Db, id: string): Promise<Item> {
  const item = await db.getFirstAsync<Item>(`SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!item) throw new Error(`항목을 찾을 수 없습니다: ${id}`);
  return item;
}

async function updateStatus(db: Db, id: string, status: TaskStatus, now: Date): Promise<void> {
  await db.runAsync('UPDATE items SET status = ?, updated_at = ? WHERE id = ?', [status, now.toISOString(), id]);
  await markDirty(db, 'items', id);
}

export async function addItem(db: Db, input: { kind: ItemKind; text: string }, now = new Date()): Promise<Item> {
  const text = input.text.trim();
  if (!text) throw new Error('내용을 입력하세요');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(),
    date: logicalDate(now),
    kind: input.kind,
    text,
    status: input.kind === 'task' ? 'open' : null,
    migrated_from: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.withTransactionAsync(() => insertItem(db, item));
  return item;
}

export async function toggleDone(db: Db, id: string, now = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open' && item.status !== 'done') throw new Error('완료 처리할 수 없는 항목입니다');
    await updateStatus(db, id, item.status === 'open' ? 'done' : 'open', now);
  });
}

export async function dropItem(db: Db, id: string, now = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open') throw new Error('열린 할 일만 버릴 수 있습니다');
    await updateStatus(db, id, 'dropped', now);
  });
}

export async function migrateToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  const ts = now.toISOString();
  const newItemId = newId();
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open') throw new Error('열린 할 일만 옮길 수 있습니다');
    await updateStatus(db, id, 'migrated', now);
    await insertItem(db, {
      ...item,
      id: newItemId,
      date: logicalDate(now),
      status: 'open',
      migrated_from: item.id,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    });
  });
  return requireItem(db, newItemId);
}

export async function deleteItem(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.withTransactionAsync(async () => {
    await requireItem(db, id);
    await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(db, 'items', id);
  });
}

export function listItemsForDate(db: Db, date: string): Promise<Item[]> {
  return db.getAllAsync<Item>(
    `SELECT ${COLUMNS} FROM items WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
}

export function listMigrationCandidates(db: Db, today: string): Promise<Item[]> {
  return db.getAllAsync<Item>(
    `SELECT ${COLUMNS} FROM items
     WHERE kind = 'task' AND status = 'open' AND date < ? AND deleted_at IS NULL
     ORDER BY date, created_at`,
    [today],
  );
}
