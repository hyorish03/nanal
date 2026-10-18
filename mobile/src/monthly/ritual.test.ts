import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, deleteItem, type Item, migrateToToday } from '../items/repo';
import {
  chronicLabel,
  groupByDate,
  listFirstDates,
  listMonthLeftovers,
  listMonthLeftoversSplit,
  monthsSince,
  MONTH_RITUAL_KEY,
  markMonthRitual,
  monthRitualDue,
  monthStart,
  readMonthRitualDue,
  shouldShowMonthRitual,
} from './ritual';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

test('monthStart: 논리 날짜가 속한 달의 1일', () => {
  expect(monthStart('2026-11-17')).toBe('2026-11-01');
  expect(monthStart('2027-01-01')).toBe('2027-01-01');
});

test('새 달에 처음이면 띄울 차례, 같은 달에는 다시 띄우지 않는다', () => {
  const nov1 = new Date(2026, 10, 1, 9, 0);
  expect(monthRitualDue(null, nov1)).toBe(true);
  expect(monthRitualDue('2026-10', nov1)).toBe(true);
  expect(monthRitualDue('2026-11', nov1)).toBe(false);
  expect(monthRitualDue('2026-11', new Date(2026, 10, 30, 23, 0))).toBe(false);
  // 해가 바뀌어도 달로 비교한다
  expect(monthRitualDue('2026-12', new Date(2027, 0, 1, 9, 0))).toBe(true);
});

test('새벽 4시 전은 전날(지난달 마지막 날)로 친다', () => {
  expect(monthRitualDue('2026-10', new Date(2026, 10, 1, 3, 59))).toBe(false);
  expect(monthRitualDue('2026-10', new Date(2026, 10, 1, 4, 0))).toBe(true);
});

test('정리할 일이 없으면 띄우지 않는다', () => {
  const nov1 = new Date(2026, 10, 1, 9, 0);
  expect(shouldShowMonthRitual('2026-10', nov1, 0)).toBe(false);
  expect(shouldShowMonthRitual('2026-10', nov1, 2)).toBe(true);
  expect(shouldShowMonthRitual('2026-11', nov1, 2)).toBe(false);
});

test('따져 본 달을 남기면 같은 달 다음 실행에는 차례가 아니다', async () => {
  const store = memoryStore();
  const nov1 = new Date(2026, 10, 1, 9, 0);
  expect(await readMonthRitualDue(store, nov1)).toBe(true);
  await markMonthRitual(store, nov1);
  expect(store.data.get(MONTH_RITUAL_KEY)).toBe('2026-11');
  expect(await readMonthRitualDue(store, new Date(2026, 10, 2, 9, 0))).toBe(false);
  expect(await readMonthRitualDue(store, new Date(2026, 11, 1, 9, 0))).toBe(true);
});

test('새벽 4시 전에 남기면 지난달로 남는다', async () => {
  const store = memoryStore();
  await markMonthRitual(store, new Date(2026, 10, 1, 2, 0));
  expect(store.data.get(MONTH_RITUAL_KEY)).toBe('2026-10');
});

test('저장소를 읽지 못하면 띄우지 않는다', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('x');
    },
    setItem: async () => {
      throw new Error('x');
    },
  };
  expect(await readMonthRitualDue(broken, new Date(2026, 10, 1, 9, 0))).toBe(false);
  await expect(markMonthRitual(broken, new Date())).resolves.toBeUndefined();
});

const item = (id: string, date: string): Item => ({
  id,
  date,
  kind: 'task',
  text: id,
  status: 'open',
  priority: false,
  migrated_from: null,
  delay_reason: null,
  position: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
});

test('groupByDate: 원래 날짜별로, 오래된 날부터, 같은 날은 받은 순서대로', () => {
  const groups = groupByDate([item('c', '2026-10-20'), item('a', '2026-09-30'), item('d', '2026-10-20'), item('b', '2026-10-02')]);
  expect(groups.map((g) => g.date)).toEqual(['2026-09-30', '2026-10-02', '2026-10-20']);
  expect(groups[2].items.map((i) => i.id)).toEqual(['c', 'd']);
  expect(groupByDate([])).toEqual([]);
});

describe('listMonthLeftovers', () => {
  let db: Db;
  beforeEach(async () => {
    db = openTestDb();
    await migrate(db);
  });

  test('이번 달 1일 전의 끝나지 않은 할 일만(지운 것·끝낸 것·옮긴 것·메모·이번 달 것 빼고)', async () => {
    const oct = new Date(2026, 9, 20, 9, 0);
    const open = await addItem(db, { kind: 'task', text: '열린 일' }, oct);
    const doing = await addItem(db, { kind: 'task', text: '하는 중' }, new Date(2026, 9, 5, 9, 0));
    await advanceStatus(db, doing.id, oct);
    const done = await addItem(db, { kind: 'task', text: '끝낸 일' }, oct);
    await advanceStatus(db, done.id, oct);
    await advanceStatus(db, done.id, oct);
    const gone = await addItem(db, { kind: 'task', text: '지운 일' }, oct);
    await deleteItem(db, gone.id, oct);
    await addItem(db, { kind: 'note', text: '메모' }, oct);
    const moved = await addItem(db, { kind: 'task', text: '옮긴 일' }, new Date(2026, 9, 1, 9, 0));
    await migrateToToday(db, moved.id, oct); // 10/20로 옮겨져 그 줄이 남는다
    await addItem(db, { kind: 'task', text: '이번 달 일' }, new Date(2026, 10, 3, 9, 0));

    const left = await listMonthLeftovers(db, '2026-11-05');
    expect(left.map((i) => i.text)).toEqual(['하는 중', '열린 일', '옮긴 일']);
    expect(left.map((i) => i.id)).toContain(open.id);
    // 10월 안에서는 대상이 아니다
    expect(await listMonthLeftovers(db, '2026-10-25')).toEqual([]);
  });
});

test('monthsSince: 처음 적은 달에서 이번 달까지 몇 달째인지(해를 넘겨도)', () => {
  expect(monthsSince('2026-10-31', '2026-11-01')).toBe(1);
  expect(monthsSince('2026-08-04', '2026-11-01')).toBe(3);
  expect(monthsSince('2026-11-15', '2027-01-01')).toBe(2);
});

test('chronicLabel: 두·석·넉 달째, 다섯 달부터는 숫자', () => {
  expect(chronicLabel(2)).toBe('두 달째 넘어온 일');
  expect(chronicLabel(3)).toBe('석 달째 넘어온 일');
  expect(chronicLabel(4)).toBe('넉 달째 넘어온 일');
  expect(chronicLabel(5)).toBe('5달째 넘어온 일');
});

test('오래 머문 일: 옮긴 줄을 거슬러 처음 적은 날로 센다(날마다 옮겨도 몇 번 옮겼는지로 세지 않는다)', async () => {
  const db = openTestDb();
  await migrate(db);
  // 8월에 적고 9월·10월로 옮긴 일 → 11월에 석 달째
  const old = await addItem(db, { kind: 'task', text: '운동' }, new Date(2026, 7, 4, 9));
  const sep = await migrateToToday(db, old.id, new Date(2026, 8, 1, 9));
  await migrateToToday(db, sep.id, new Date(2026, 9, 6, 9));
  // 10월에 적고 날마다 사흘 옮긴 일 → 처음 넘어온 일
  let daily = await addItem(db, { kind: 'task', text: '세탁소' }, new Date(2026, 9, 26, 9));
  for (const d of [27, 28, 29]) daily = await migrateToToday(db, daily.id, new Date(2026, 9, d, 9));
  // 9월에 적고 그대로 둔 일 → 두 달째
  await addItem(db, { kind: 'task', text: '포트폴리오' }, new Date(2026, 8, 20, 9));

  const { chronic, fresh } = await listMonthLeftoversSplit(db, '2026-11-01');
  expect(chronic.map((c) => [c.item.text, c.months])).toEqual([
    ['운동', 3],
    ['포트폴리오', 2],
  ]);
  expect(fresh.map((i) => i.text)).toEqual(['세탁소']);
});

test('listFirstDates: 빈 목록이면 묻지 않는다', async () => {
  const db = openTestDb();
  await migrate(db);
  expect((await listFirstDates(db, [])).size).toBe(0);
});
