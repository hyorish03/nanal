import { getMood } from '../days/repo';
import type { Db } from '../db/types';
import { listItemsForDate } from '../items/repo';
import { logicalDate } from '../lib/date';
import type { KeyValueStore } from '../lib/onboarding';
import { listReflections } from '../reflections/repo';
import { NOTIFICATION_KINDS, type NotificationPrefs, type TodayFacts } from './plan';

// 알림마다 켜고 끈 값. 기기에만 둔다(기기마다 알림 권한이 따로라서). 없으면 아직 묻지 않은 것이다.
export const NOTIFICATION_PREFS_KEY = 'nanal.notifications';

export async function readPrefs(store: KeyValueStore): Promise<NotificationPrefs | null> {
  try {
    const raw = await store.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, parsed[k] === true])) as NotificationPrefs;
  } catch {
    return null;
  }
}

export async function writePrefs(store: KeyValueStore, prefs: NotificationPrefs): Promise<void> {
  await store.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

// 알림 문구에 넣을 지금의 기록
export async function readTodayFacts(db: Db, now: Date): Promise<TodayFacts> {
  const today = logicalDate(now);
  const [open, items, mood, reflections] = await Promise.all([
    db.getAllAsync<{ date: string }>(
      `SELECT date FROM items WHERE kind = 'task' AND status IN ('open', 'doing') AND deleted_at IS NULL`,
      [],
    ),
    listItemsForDate(db, today),
    getMood(db, today),
    listReflections(db, today),
  ]);
  const tasks = items.filter((i) => i.kind === 'task');
  return {
    today,
    openTaskDates: open.map((r) => r.date),
    todayOpenTexts: tasks.filter((t) => t.status === 'open' || t.status === 'doing').map((t) => t.text),
    todayHasTasks: tasks.some((t) => t.status !== 'migrated' && t.status !== 'dropped'),
    eveningDone: mood !== null || reflections.length > 0,
  };
}
