import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { Db } from '../db/types';
import { NOTIFICATION_KINDS, planNotifications } from './plan';
import { activePrefs, readSettings, readTodayFacts } from './prefs';

// 알림 모듈이 들어간 빌드에서만 불러온다(예전 개발용 빌드·웹에서는 import만 해도 멈춘다).
export const notificationsAvailable = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoNotificationScheduler') != null;
const N: typeof import('expo-notifications') | null = notificationsAvailable ? require('expo-notifications') : null;

const CHANNEL = 'daily'; // Android 알림 채널

// 앱을 쓰는 중에 시각이 되어도 배너로 보여 준다
N?.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

// granted: 허용됨. denied: 방금 시스템 창에서 거절. blocked: 예전에 거절해 앱이 다시 물을 수 없다(설정 앱에서 켜야 한다).
export type PermissionResult = 'granted' | 'denied' | 'blocked';

async function isGranted(): Promise<boolean> {
  if (!N) return false;
  const p = await N.getPermissionsAsync();
  return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
}

// 아직 묻지 않았으면 시스템 창으로 묻는다.
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (!N) return 'blocked';
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted || current.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    if (!current.canAskAgain) return 'blocked';
    // Android 13은 채널이 하나는 있어야 권한 창이 뜬다
    if (Platform.OS === 'android') await ensureChannel();
    const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  try {
    return await isGranted();
  } catch {
    return false;
  }
}

async function ensureChannel() {
  await N!.setNotificationChannelAsync(CHANNEL, { name: '하루 알림', importance: N!.AndroidImportance.DEFAULT });
}

// 예약을 모두 지우고 지금 기록으로 다시 짠다. 겹쳐 불려도 차례로 한 번씩만 돈다.
let chain: Promise<void> = Promise.resolve();
export function rescheduleNotifications(db: Db): Promise<void> {
  chain = chain.then(() => reschedule(db)).catch(() => {});
  return chain;
}

async function reschedule(db: Db) {
  if (!N) return;
  const now = new Date();
  const prefs = activePrefs(await readSettings(AsyncStorage));
  const on = NOTIFICATION_KINDS.some((k) => prefs[k]) && (await isGranted());
  const planned = on ? planNotifications(prefs, await readTodayFacts(db, now), now) : [];
  await N.cancelAllScheduledNotificationsAsync();
  if (planned.length === 0) return;
  if (Platform.OS === 'android') await ensureChannel();
  for (const n of planned) {
    await N.scheduleNotificationAsync({
      identifier: n.id,
      content: { body: n.body, data: n.screen ? { screen: n.screen } : {} },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  }
}

// 로그아웃하면 이 기기에 예약해 둔 알림을 거둔다
export function cancelNotifications(): Promise<void> {
  if (!N) return Promise.resolve();
  chain = chain.then(() => N.cancelAllScheduledNotificationsAsync()).catch(() => {});
  return chain;
}

// 기록이 바뀔 때마다(version) 잠시 모았다가 다시 짠다. 화면이 내려가면(로그아웃) 예약을 거둔다.
export function useNotificationSchedule(db: Db, version: number) {
  useEffect(() => {
    const t = setTimeout(() => void rescheduleNotifications(db), 800);
    return () => clearTimeout(t);
  }, [db, version]);
  useEffect(() => () => void cancelNotifications(), []);
}

// 알림을 눌러 앱을 열면 알려 준다(콜드 스타트 포함). 지금은 하루 마무리 알림만 화면을 정한다.
export function useNotificationOpen(onOpen: (screen: 'evening' | null) => void) {
  const handler = useRef(onOpen);
  useEffect(() => {
    handler.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (!N) return;
    const handle = (response: import('expo-notifications').NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
      void N.clearLastNotificationResponseAsync().catch(() => {});
      handler.current(response.notification.request.content.data?.screen === 'evening' ? 'evening' : null);
    };
    handle(N.getLastNotificationResponse());
    const sub = N.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
