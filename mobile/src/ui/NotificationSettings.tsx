import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Switch, View } from 'react-native';
import type { Db } from '../db/types';
import { ALL_OFF, type NotificationKind, type NotificationPrefs } from '../notifications/plan';
import { readPrefs, writePrefs } from '../notifications/prefs';
import { hasNotificationPermission, notificationsAvailable, requestNotificationPermission, rescheduleNotifications } from '../notifications/scheduler';
import { colors } from './theme';
import { Txt } from './Txt';

const ROWS: { kind: NotificationKind; label: string; sub: string }[] = [
  { kind: 'morning', label: '아침 계획', sub: '오전 8시 · 지난 할 일 정리' },
  { kind: 'evening', label: '퇴근', sub: '평일 오후 6시 · 오늘 남은 일' },
  { kind: 'night', label: '하루 마무리', sub: '오후 10시 · 마무리했으면 안 울려요' },
  { kind: 'month', label: '월초 정리', sub: '매달 1일, 아침 알림 대신' },
];

// 기기 설정에서 알림을 막아 두었으면 앱이 다시 물을 수 없다. 설정 앱으로 안내한다
export function alertNotificationsBlocked() {
  Alert.alert('알림이 꺼져 있어요', '설정 앱에서 나날의 알림을 허용해 주세요.', [
    { text: '닫기', style: 'cancel' },
    { text: '설정 열기', onPress: () => void Linking.openSettings().catch(() => {}) },
  ]);
}

// 계정 시트·사이드바의 알림 켜기·끄기(스펙 "알림"). 기기 권한이 없으면 모두 꺼진 것으로 보여 주고,
// 켜려고 하면 그때 권한을 묻는다.
export function NotificationSettings({ db, compact = false }: { db: Db; compact?: boolean }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(ALL_OFF);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!notificationsAvailable) return;
    let alive = true;
    const load = () =>
      Promise.all([readPrefs(AsyncStorage), hasNotificationPermission()]).then(([p, g]) => {
        if (!alive) return;
        setPrefs(p ?? ALL_OFF);
        setGranted(g);
      });
    load();
    // 설정 앱에서 허용하고 돌아오면 바로 반영한다
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!notificationsAvailable) return null;

  const toggle = async (kind: NotificationKind, value: boolean) => {
    if (value && !granted) {
      if ((await requestNotificationPermission()) !== 'granted') {
        alertNotificationsBlocked();
        return;
      }
      setGranted(true);
    }
    const next = { ...prefs, [kind]: value };
    setPrefs(next);
    await writePrefs(AsyncStorage, next).catch(() => {});
    void rescheduleNotifications(db);
  };

  return (
    <View>
      <Txt variant="hand" accessibilityRole="header">
        알림
      </Txt>
      {ROWS.map((r) => (
        <View key={r.kind} style={[styles.row, compact && styles.rowCompact]}>
          <View style={styles.text}>
            <Txt style={compact ? styles.labelCompact : styles.label}>{r.label}</Txt>
            <Txt style={styles.sub}>{r.sub}</Txt>
          </View>
          <Switch
            accessibilityLabel={`${r.label} 알림`}
            accessibilityHint={r.sub}
            value={granted && prefs[r.kind]}
            onValueChange={(v) => void toggle(r.kind, v)}
            trackColor={{ false: colors.dotOff, true: colors.navy }}
            ios_backgroundColor={colors.dotOff}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineFaint },
  rowCompact: { minHeight: 48, gap: 8 },
  text: { flex: 1 },
  label: { fontSize: 16, lineHeight: 22, color: colors.ink },
  labelCompact: { fontSize: 14, lineHeight: 20, color: colors.ink },
  sub: { fontSize: 12, lineHeight: 17, color: colors.muted },
});
