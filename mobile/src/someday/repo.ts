import type { Db, Tx } from '../db/types';
import { insertTaskInTx, type Item, MAX_TEXT } from '../items/repo';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

// 언젠가: 날짜 없이 언젠가 할 일 한 목록. 오늘 장(items)과 따로 둬서 넘어온 일·월초 정리·셈·위젯·기록한 날에 섞이지 않는다.
// 진행 중(doing)은 없다: 할 일 → 끝낸 일 → 할 일. 오늘 할 일로 옮기면 지우지 않고 › 옮긴 일(migrated)로 남긴다.
export type SomedayStatus = 'open' | 'done' | 'migrated' | 'dropped';

export type Someday = {
  id: string;
  text: string;
  status: SomedayStatus;
  priority: boolean;
  migrated_to: string | null; // 오늘 할 일로 옮겨 만든 items의 id
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SomedayRow = Omit<Someday, 'priority'> & { priority: number };

const NEXT_STATUS: Partial<Record<SomedayStatus, SomedayStatus>> = { open: 'done', done: 'open', dropped: 'open' };
const COLUMNS = 'id, text, status, priority, migrated_to, created_at, updated_at, deleted_at';

const toSomeday = (row: SomedayRow): Someday => ({ ...row, priority: row.priority === 1 });

function cleanText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('내용을 입력하세요');
  if (Array.from(trimmed).length > MAX_TEXT) throw new Error(`${MAX_TEXT}자까지 쓸 수 있어요`);
  return trimmed;
}

async function requireSomeday(tx: Tx, id: string): Promise<Someday> {
  const row = await tx.getFirstAsync<SomedayRow>(`SELECT ${COLUMNS} FROM someday WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new Error(`항목을 찾을 수 없습니다: ${id}`);
  return toSomeday(row);
}

async function update(
  tx: Tx,
  id: string,
  fields: { status?: SomedayStatus; priority?: boolean; migrated_to?: string | null; text?: string },
  now: Date,
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (fields.status !== undefined) {
    sets.push('status = ?');
    params.push(fields.status);
  }
  if (fields.priority !== undefined) {
    sets.push('priority = ?');
    params.push(fields.priority ? 1 : 0);
  }
  if (fields.migrated_to !== undefined) {
    sets.push('migrated_to = ?');
    params.push(fields.migrated_to);
  }
  if (fields.text !== undefined) {
    sets.push('text = ?');
    params.push(fields.text);
  }
  await tx.runAsync(`UPDATE someday SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, now.toISOString(), id]);
  await markDirty(tx, 'someday', id);
}

export async function addSomeday(db: Db, text: string, now = new Date()): Promise<Someday> {
  const ts = now.toISOString();
  const row: Someday = {
    id: newId(),
    text: cleanText(text),
    status: 'open',
    priority: false,
    migrated_to: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.transaction(async (tx) => {
    await tx.runAsync(`INSERT INTO someday (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      row.id,
      row.text,
      row.status,
      0,
      null,
      ts,
      ts,
      null,
    ]);
    await markDirty(tx, 'someday', row.id);
  });
  return row;
}

// 적은 순서 그대로(오늘 장과 같다). 끝낸 줄을 아래로 모으는 건 화면이 한다
export async function listSomeday(db: Db): Promise<Someday[]> {
  const rows = await db.getAllAsync<SomedayRow>(
    `SELECT ${COLUMNS} FROM someday WHERE deleted_at IS NULL ORDER BY created_at, id`,
    [],
  );
  return rows.map(toSomeday);
}

// 화면에 놓는 순서: 끝낸 줄은 아래로 모은다(이 목록에서만). 나머지는 적은 순서 그대로, 옮긴 일·안 하기로 한 일도 제자리에 남는다
export function sortSomeday<T extends Pick<Someday, 'status'>>(rows: T[]): T[] {
  return [...rows.filter((r) => r.status !== 'done'), ...rows.filter((r) => r.status === 'done')];
}

// 기호를 누르면 할 일 → 끝낸 일 → 할 일. 안 하기로 한 일은 다시 할 일로. 옮긴 일은 바뀌지 않는다
export async function advanceSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    const next = NEXT_STATUS[row.status];
    if (!next) throw new Error('상태를 바꿀 수 없는 항목입니다');
    await update(tx, id, { status: next }, now);
  });
}

// 형광펜. 오늘 장과 달리 개수 제한이 없다(매일 고르는 목록이 아니라서)
export async function setSomedayPriority(db: Db, id: string, on: boolean, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    if (on && row.status !== 'open') throw new Error('끝나지 않은 일에만 형광펜을 칠할 수 있어요');
    await update(tx, id, { priority: on }, now);
  });
}

export async function updateSomedayText(db: Db, id: string, text: string, now = new Date()): Promise<void> {
  const trimmed = cleanText(text);
  await db.transaction(async (tx) => {
    await requireSomeday(tx, id);
    await update(tx, id, { text: trimmed }, now);
  });
}

// 안 하기: 지우지 않고 줄을 긋는다. 기호를 누르거나 되돌리기로 다시 할 일이 된다
export async function dropSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    if (row.status !== 'open') throw new Error('끝나지 않은 일만 안 하기로 할 수 있어요');
    await update(tx, id, { status: 'dropped' }, now);
  });
}

export async function undoDropSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    if (row.status !== 'dropped') throw new Error('안 하기로 한 일이 아니라 되돌릴 수 없습니다');
    await update(tx, id, { status: 'open' }, now);
  });
}

export async function deleteSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    await requireSomeday(tx, id);
    await tx.runAsync('UPDATE someday SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(tx, 'someday', id);
  });
}

// 지우고 바로 '되돌리기'를 눌렀을 때
export async function restoreSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM someday WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    if (!row) throw new Error(`되돌릴 항목을 찾을 수 없습니다: ${id}`);
    await tx.runAsync('UPDATE someday SET deleted_at = NULL, updated_at = ? WHERE id = ?', [now.toISOString(), id]);
    await markDirty(tx, 'someday', id);
  });
}

// 오늘 할 일로: 한 트랜잭션에서 오늘(논리 날짜) 장에 같은 글의 할 일을 만들고, 이 줄은 › 옮긴 일로 남긴다
export async function moveSomedayToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  return db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    if (row.status !== 'open') throw new Error('끝나지 않은 일만 오늘로 옮길 수 있어요');
    const created = await insertTaskInTx(tx, row.text, logicalDate(now), now);
    await update(tx, id, { status: 'migrated', migrated_to: created.id }, now);
    return created;
  });
}

// 옮기고 바로 '되돌리기'를 눌렀을 때: 오늘 장에 만든 줄은 지우고, 이 줄은 다시 할 일로
export async function undoMoveSomeday(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    const row = await requireSomeday(tx, id);
    if (row.status !== 'migrated' || !row.migrated_to) throw new Error('오늘로 옮긴 일이 아니라 되돌릴 수 없습니다');
    const created = await tx.getFirstAsync<{ id: string }>('SELECT id FROM items WHERE id = ? AND deleted_at IS NULL', [
      row.migrated_to,
    ]);
    if (created) {
      await tx.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, created.id]);
      await markDirty(tx, 'items', created.id);
    }
    await update(tx, id, { status: 'open', migrated_to: null }, now);
  });
}
