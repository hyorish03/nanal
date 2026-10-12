import { migrate } from '../db/schema';
import { setMood } from '../days/repo';
import { addItem, advanceStatus, deleteItem, migrateToToday, setPriority } from '../items/repo';
import { countRecordedDays } from '../stats/recordedDays';
import { openTestDb } from '../../test/sqlite';
import { pickNext, readWidgetSnapshot, widgetAdvance } from './sql';

const NOW = new Date(2026, 9, 8, 9, 0); // 10월 8일 오전 9시(논리 날짜 2026-10-08)
const YESTERDAY = new Date(2026, 9, 7, 9, 0);
const TODAY = '2026-10-08';

async function setup() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

const outboxVersion = async (db: Awaited<ReturnType<typeof setup>>, id: string) =>
  (await db.getFirstAsync<{ version: number }>("SELECT version FROM outbox WHERE table_name = 'items' AND row_key = ?", [id]))?.version ?? null;

describe('readWidgetSnapshot', () => {
  it('오늘 할 일만 진행 중 → 중요 → 입력 순 → 끝낸 일 순서로 읽는다', async () => {
    const db = await setup();
    const a = await addItem(db, { kind: 'task', text: '빨래' }, NOW);
    await addItem(db, { kind: 'task', text: '책 사기' }, new Date(NOW.getTime() + 1000));
    const c = await addItem(db, { kind: 'task', text: '전화' }, new Date(NOW.getTime() + 2000));
    const d = await addItem(db, { kind: 'task', text: '보고서' }, new Date(NOW.getTime() + 3000));
    await addItem(db, { kind: 'note', text: '메모는 빠진다' }, NOW);
    const gone = await addItem(db, { kind: 'task', text: '지운 일' }, NOW);
    await deleteItem(db, gone.id, NOW);
    await advanceStatus(db, a.id, NOW); // 진행 중
    await advanceStatus(db, a.id, NOW); // 끝냄
    await setPriority(db, c.id, true, NOW);
    await advanceStatus(db, d.id, NOW); // 진행 중

    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.items.map((i) => [i.text, i.status, i.priority])).toEqual([
      ['보고서', 'doing', false],
      ['전화', 'open', true],
      ['책 사기', 'open', false],
      ['빨래', 'done', false],
    ]);
    expect(pickNext(snap.items)?.id).toBe(d.id);
  });

  it('밀린 일은 개수만, 옮긴 원래 항목은 오늘 목록에서 빠진다', async () => {
    const db = await setup();
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await addItem(db, { kind: 'task', text: '어제 다른 일' }, YESTERDAY);
    await migrateToToday(db, old.id, NOW);
    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.carried).toBe(1);
    expect(snap.items.map((i) => i.text)).toEqual(['어제 일']);
  });

  it('기분과 기록한 날', async () => {
    const db = await setup();
    await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await setMood(db, TODAY, 4, NOW);
    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.mood).toBe(4);
    expect(snap.recordedDays).toBe(await countRecordedDays(db));
    expect(snap.recordedDays).toBe(2);
  });

  it('다 끝냈으면 다음 할 일이 없다', async () => {
    expect(pickNext([{ id: 'a', text: 'x', status: 'done', priority: false }])).toBeNull();
    expect(pickNext([])).toBeNull();
  });
});

const STATUS_CYCLE = ['open', 'doing', 'done'] as const;

describe('widgetAdvance', () => {
  it('위젯이 보여 준 상태와 다르면 바꾸지 않는다', async () => {
    const db = await setup();
    const it1 = await addItem(db, { kind: 'task', text: '그 사이 바뀜' }, NOW);
    await advanceStatus(db, it1.id, NOW); // 앱에서 진행 중으로
    const before = await outboxVersion(db, it1.id);
    expect(await widgetAdvance(db, it1.id, 'open', NOW)).toBe(false);
    const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM items WHERE id = ?', [it1.id]);
    expect(row?.status).toBe('doing');
    expect(await outboxVersion(db, it1.id)).toBe(before);
  });

  it('앱의 advanceStatus와 같은 순서로 바꾸고 outbox에 남긴다', async () => {
    const db = await setup();
    const app = await addItem(db, { kind: 'task', text: '앱에서' }, NOW);
    const widget = await addItem(db, { kind: 'task', text: '위젯에서' }, NOW);
    const later = new Date(NOW.getTime() + 60_000);
    const seen: [string | null, string | null][] = [];
    for (let i = 0; i < 3; i++) {
      await advanceStatus(db, app.id, later);
      expect(await widgetAdvance(db, widget.id, STATUS_CYCLE[i], later)).toBe(true);
      const rows = await db.getAllAsync<{ id: string; status: string; updated_at: string }>(
        'SELECT id, status, updated_at FROM items WHERE id IN (?, ?) ORDER BY text',
        [app.id, widget.id],
      );
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[widget.id].updated_at).toBe(later.toISOString());
      seen.push([byId[app.id].status, byId[widget.id].status]);
      expect(await outboxVersion(db, widget.id)).toBe(await outboxVersion(db, app.id));
    }
    expect(seen).toEqual([
      ['doing', 'doing'],
      ['done', 'done'],
      ['open', 'open'],
    ]);
  });

  it('메모, 옮긴 일, 지운 일, 없는 id는 바꾸지 않고 outbox도 그대로', async () => {
    const db = await setup();
    const note = await addItem(db, { kind: 'note', text: '메모' }, NOW);
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await migrateToToday(db, old.id, NOW); // old는 migrated
    const gone = await addItem(db, { kind: 'task', text: '지운 일' }, NOW);
    await deleteItem(db, gone.id, NOW);
    for (const id of [note.id, old.id, gone.id, 'missing']) {
      const before = await outboxVersion(db, id);
      expect(await widgetAdvance(db, id, 'open', NOW)).toBe(false);
      expect(await outboxVersion(db, id)).toBe(before);
    }
  });
});
