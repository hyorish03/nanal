import { getMood } from '../days/repo';
import type { Db } from '../db/types';
import { listItemsForDate } from '../items/repo';
import { addDays, logicalDate } from '../lib/date';
import type { KeyValueStore } from '../lib/onboarding';
import { listReflections } from '../reflections/repo';
import { ALL_OFF, NOTIFICATION_KINDS, type NotificationPrefs, type TodayFacts } from './plan';

// 알림 설정: 전체 켜기(enabled)와 알림마다 켜고 끈 값. 기기에만 둔다(기기마다 알림 권한이 따로라서).
// 없으면 아직 정하지 않은 것이다(하루 마무리 뒤 포스트잇으로 묻는다). 전체를 껐다 켜면 알림마다 고른 값이 그대로 돌아온다.
export const NOTIFICATION_PREFS_KEY = 'nanal.notifications';

export type NotificationSettings = { enabled: boolean; kinds: NotificationPrefs };

export async function readSettings(store: KeyValueStore): Promise<NotificationSettings | null> {
  try {
    const raw = await store.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs> & { enabled?: boolean; kinds?: Partial<NotificationPrefs> };
    const source = parsed.kinds ?? parsed; // 빌드 14는 알림마다 값만 바로 남겼다
    const kinds = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, source[k] === true])) as NotificationPrefs;
    const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : NOTIFICATION_KINDS.some((k) => kinds[k]);
    return { enabled, kinds };
  } catch {
    return null;
  }
}

export async function writeSettings(store: KeyValueStore, settings: NotificationSettings): Promise<void> {
  await store.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(settings));
}

// 실제로 울릴 알림(전체가 꺼져 있으면 모두 끈 것)
export function activePrefs(settings: NotificationSettings | null): NotificationPrefs {
  return settings?.enabled ? settings.kinds : ALL_OFF;
}

// 하루 마무리 뒤 포스트잇으로 묻기. "괜찮아요"를 누르면 3일 뒤, 또 누르면 7일 뒤에 다시 묻고, 세 번째에는 그만 묻는다
// (그 뒤로는 설정에서만 켠다). 알림을 한 번이라도 정했으면(설정이 있으면) 묻지 않는다.
export const NOTIFY_ASK_KEY = 'nanal.notifyAsk';
export const REASK_AFTER_DAYS = [3, 7];
export const MAX_DECLINES = REASK_AFTER_DAYS.length + 1;

export type AskState = { declines: number; next: string | null }; // next: 다시 물어도 되는 첫 날(논리 날짜)
const FRESH: AskState = { declines: 0, next: null };

export async function readAskState(store: KeyValueStore): Promise<AskState> {
  try {
    const raw = await store.getItem(NOTIFY_ASK_KEY);
    if (!raw) return FRESH;
    const p = JSON.parse(raw) as Partial<AskState>;
    return { declines: typeof p.declines === 'number' ? p.declines : 0, next: typeof p.next === 'string' ? p.next : null };
  } catch {
    return FRESH;
  }
}

export function askDue(settings: NotificationSettings | null, ask: AskState, today: string): boolean {
  return settings === null && ask.declines < MAX_DECLINES && (ask.next === null || today >= ask.next);
}

export function afterDecline(ask: AskState, today: string): AskState {
  const declines = ask.declines + 1;
  const wait = REASK_AFTER_DAYS[declines - 1];
  return { declines, next: wait === undefined ? null : addDays(today, wait) };
}

export async function recordDecline(store: KeyValueStore, today: string): Promise<void> {
  await store.setItem(NOTIFY_ASK_KEY, JSON.stringify(afterDecline(await readAskState(store), today)));
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
