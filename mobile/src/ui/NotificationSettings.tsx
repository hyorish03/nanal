import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import type { Db } from '../db/types';
import { ALL_ON, type NotificationKind } from '../notifications/plan';
import { type NotificationSettings as Settings, readSettings, writeSettings } from '../notifications/prefs';
import { hasNotificationPermission, notificationsAvailable, requestNotificationPermission, rescheduleNotifications } from '../notifications/scheduler';
import { SettingsGroup, settingsStyles } from './SettingsGroup';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

const ROWS: { kind: NotificationKind; label: string; sub: string }[] = [
  { kind: 'morning', label: '아침 계획', sub: '오전 8시' },
  { kind: 'evening', label: '퇴근', sub: '평일 오후 6시' },
  { kind: 'night', label: '하루 마무리', sub: '오후 10시' },
  { kind: 'month', label: '월초 정리', sub: '매달 1일 아침' },
];

// 기기 설정에서 알림을 막아 두었으면 앱이 다시 물을 수 없다. 설정 앱으로 안내한다
export function alertNotificationsBlocked() {
  Alert.alert('알림이 꺼져 있어요', '설정 앱에서 나날의 알림을 허용해 주세요.', [
    { text: '닫기', style: 'cancel' },
    { text: '설정 열기', onPress: () => void Linking.openSettings().catch(() => {}) },
  ]);
}

// 설정 화면의 알림: 맨 위 "알림 받기"(전체)와 알림 네 개. 전체를 끄면 네 개가 흐려지고 고른 값은 남는다.
// 기기 권한이 없으면 전체가 꺼진 것으로 보여 주고, 켜려고 하면 그때 권한을 묻는다.
export function NotificationSettings({ db }: { db: Db }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!notificationsAvailable) return;
    let alive = true;
    const load = () =>
      Promise.all([readSettings(AsyncStorage), hasNotificationPermission()]).then(([s, g]) => {
        if (!alive) return;
        setSettings(s);
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

  const kinds = settings?.kinds ?? ALL_ON; // 아직 정하지 않았으면 전체를 켤 때 네 개 모두 켠다
  const enabled = granted && settings?.enabled === true;

  const save = async (next: Settings) => {
    setSettings(next);
    await writeSettings(AsyncStorage, next).catch(() => {});
    void rescheduleNotifications(db);
  };

  const toggleAll = async (value: boolean) => {
    if (value && !granted) {
      const result = await requestNotificationPermission();
      if (result !== 'granted') {
        if (result === 'blocked') alertNotificationsBlocked();
        return;
      }
      setGranted(true);
    }
    await save({ enabled: value, kinds });
  };

  return (
    <SettingsGroup label="알림">
      <View style={[settingsStyles.row, settingsStyles.line]}>
        <Txt variant="medium" style={[settingsStyles.rowText, styles.flex]}>
          알림 받기
        </Txt>
        <SmallSwitch label="알림 받기" value={enabled} onChange={(v) => void toggleAll(v)} />
      </View>
      <View style={!enabled && styles.dim} importantForAccessibility={enabled ? 'auto' : 'no-hide-descendants'}>
        {ROWS.map((r, i) => (
          <View key={r.kind} style={[settingsStyles.row, styles.kindRow, i < ROWS.length - 1 && settingsStyles.line]}>
            <View style={styles.flex}>
              <Txt style={settingsStyles.rowText}>{r.label}</Txt>
              <Txt style={settingsStyles.sub}>{r.sub}</Txt>
            </View>
            <SmallSwitch
              label={`${r.label} 알림`}
              hint={r.sub}
              value={enabled && kinds[r.kind]}
              disabled={!enabled}
              onChange={(v) => void save({ enabled: true, kinds: { ...kinds, [r.kind]: v } })}
            />
          </View>
        ))}
      </View>
    </SettingsGroup>
  );
}

// 종이 화면에 맞춘 작은 스위치(40×24). iOS 기본 스위치는 실제로 그려지는 크기가 자리와 달라
// 줄이면 위로 떠 보여서 직접 그린다. 누르는 자리는 hitSlop으로 44pt를 지킨다
function SmallSwitch({ label, hint, value, disabled, onChange }: { label: string; hint?: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const reduce = useReduceMotion();
  const pos = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: value ? 1 : 0, duration: reduce ? 0 : 160, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [value, reduce, pos]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={SWITCH_SLOP}
      onPress={() => onChange(!value)}
      style={[styles.track, value ? styles.trackOn : styles.trackOff]}
    >
      <Animated.View style={[styles.knob, { transform: [{ translateX: pos.interpolate({ inputRange: [0, 1], outputRange: [0, KNOB_TRAVEL] }) }] }]} />
    </Pressable>
  );
}

const SWITCH_W = 40;
const SWITCH_H = 24;
const KNOB = 20;
const KNOB_TRAVEL = SWITCH_W - KNOB - 4;
const SWITCH_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

const styles = StyleSheet.create({
  kindRow: { minHeight: 52, paddingVertical: 4 },
  dim: { opacity: 0.45 },
  flex: { flex: 1 },
  track: { width: SWITCH_W, height: SWITCH_H, borderRadius: SWITCH_H / 2, padding: 2, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.navy },
  trackOff: { backgroundColor: colors.dotOff },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.popover, shadowColor: colors.shadow, shadowOpacity: 0.25, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 } },
});
