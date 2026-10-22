import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, migrateToToday } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { ALL_ON } from './plan';
import { NOTIFICATION_PREFS_KEY, readPrefs, readTodayFacts, writePrefs } from './prefs';

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

describe('prefs', () => {
  test('저장하지 않았으면 null(아직 묻지 않음)', async () => {
    expect(await readPrefs(memoryStore())).toBeNull();
  });

  test('쓴 값을 그대로 읽고, 모르는 값은 끈 것으로', async () => {
    const store = memoryStore();
    await writePrefs(store, { ...ALL_ON, evening: false });
    expect(await readPrefs(store)).toEqual({ morning: true, evening: false, night: true, month: true });
    store.data.set(NOTIFICATION_PREFS_KEY, '{"morning":true}');
    expect(await readPrefs(store)).toEqual({ morning: true, evening: false, night: false, month: false });
  });

  test('깨진 값은 null', async () => {
    const store = memoryStore();
    store.data.set(NOTIFICATION_PREFS_KEY, '{');
    expect(await readPrefs(store)).toBeNull();
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
