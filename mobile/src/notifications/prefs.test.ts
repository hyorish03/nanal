import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, migrateToToday } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { ALL_OFF, ALL_ON } from './plan';
import {
  activePrefs,
  askDue,
  MAX_DECLINES,
  NOTIFICATION_PREFS_KEY,
  NOTIFY_ASK_KEY,
  readAskState,
  readSettings,
  readTodayFacts,
  recordDecline,
  writeSettings,
} from './prefs';

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

describe('settings', () => {
  test('저장하지 않았으면 null(아직 정하지 않음)', async () => {
    expect(await readSettings(memoryStore())).toBeNull();
  });

  test('쓴 값을 그대로 읽는다', async () => {
    const store = memoryStore();
    const s = { enabled: false, kinds: { ...ALL_ON, evening: false } };
    await writeSettings(store, s);
    expect(await readSettings(store)).toEqual(s);
  });

  test('빌드 14 모양(알림마다 값만)도 읽는다. 하나라도 켜져 있으면 전체 켜짐', async () => {
    const store = memoryStore();
    store.data.set(NOTIFICATION_PREFS_KEY, '{"morning":true}');
    expect(await readSettings(store)).toEqual({ enabled: true, kinds: { morning: true, evening: false, night: false, month: false } });
    store.data.set(NOTIFICATION_PREFS_KEY, JSON.stringify(ALL_OFF));
    expect((await readSettings(store))?.enabled).toBe(false);
  });

  test('깨진 값은 null', async () => {
    const store = memoryStore();
    store.data.set(NOTIFICATION_PREFS_KEY, '{');
    expect(await readSettings(store)).toBeNull();
  });

  test('전체를 끄면 울릴 알림이 없고, 켜면 고른 값 그대로', () => {
    const kinds = { ...ALL_ON, month: false };
    expect(activePrefs({ enabled: false, kinds })).toEqual(ALL_OFF);
    expect(activePrefs({ enabled: true, kinds })).toEqual(kinds);
    expect(activePrefs(null)).toEqual(ALL_OFF);
  });
});

describe('다시 묻기', () => {
  test('처음에는 묻고, 알림을 정했으면 묻지 않는다', () => {
    expect(askDue(null, { declines: 0, next: null }, '2026-10-22')).toBe(true);
    expect(askDue({ enabled: false, kinds: ALL_OFF }, { declines: 0, next: null }, '2026-10-22')).toBe(false);
  });

  test('거절하면 3일 뒤, 또 거절하면 7일 뒤, 세 번째 거절 뒤로는 묻지 않는다', async () => {
    const store = memoryStore();
    await recordDecline(store, '2026-10-22');
    let ask = await readAskState(store);
    expect(ask).toEqual({ declines: 1, next: '2026-10-25' });
    expect(askDue(null, ask, '2026-10-24')).toBe(false);
    expect(askDue(null, ask, '2026-10-25')).toBe(true);

    await recordDecline(store, '2026-10-25');
    ask = await readAskState(store);
    expect(ask).toEqual({ declines: 2, next: '2026-11-01' });

    await recordDecline(store, '2026-11-01');
    ask = await readAskState(store);
    expect(ask.declines).toBe(MAX_DECLINES);
    expect(askDue(null, ask, '2027-01-01')).toBe(false);
  });

  test('저장된 값이 없거나 깨졌으면 처음부터', async () => {
    const store = memoryStore();
    expect(await readAskState(store)).toEqual({ declines: 0, next: null });
    store.data.set(NOTIFY_ASK_KEY, 'x');
    expect(await readAskState(store)).toEqual({ declines: 0, next: null });
  });
});

describe('readTodayFacts', () => {
  let db: Db;
  const yesterday = new Date(2026, 9, 20, 10, 0);
  const now = new Date(2026, 9, 21, 12, 0);

  beforeEach(async () => {
    db = openTestDb();
    await migrate(db);
  });

  test('끝나지 않은 할 일 날짜, 오늘 남은 일, 마무리 여부', async () => {
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, yesterday);
    await addItem(db, { kind: 'task', text: '어제 남은 일' }, yesterday);
    await migrateToToday(db, old.id, now); // 어제 줄은 migrated, 오늘 새 줄이 생긴다
    const done = await addItem(db, { kind: 'task', text: '끝낸 일' }, now);
    await advanceStatus(db, done.id, now); // doing
    await advanceStatus(db, done.id, now); // done
    await addItem(db, { kind: 'note', text: '메모' }, now);

    const facts = await readTodayFacts(db, now);
    expect(facts.today).toBe('2026-10-21');
    expect(facts.openTaskDates.sort()).toEqual(['2026-10-20', '2026-10-21']);
    expect(facts.todayOpenTexts).toEqual(['어제 일']);
    expect(facts.todayHasTasks).toBe(true);
    expect(facts.eveningDone).toBe(false);
  });

  test('기분이나 회고를 남기면 마무리한 날', async () => {
    await setMood(db, '2026-10-21', 4, now);
    expect((await readTodayFacts(db, now)).eveningDone).toBe(true);

    const db2 = openTestDb();
    await migrate(db2);
    await addReflection(db2, { templateId: 'free', answers: { body: '좋았다' } }, now);
    expect((await readTodayFacts(db2, now)).eveningDone).toBe(true);
  });

  test('할 일이 없으면 todayHasTasks는 false', async () => {
    const facts = await readTodayFacts(db, now);
    expect(facts).toMatchObject({ todayOpenTexts: [], todayHasTasks: false, openTaskDates: [] });
  });
});
