import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Db } from '../../db/types';
import { logicalDate } from '../../lib/date';
import { ALL_ON } from '../../notifications/plan';
import { askDue, readAskState, readSettings, recordDecline, writeSettings } from '../../notifications/prefs';
import { notificationsAvailable, requestNotificationPermission, rescheduleNotifications } from '../../notifications/scheduler';
import { alertNotificationsBlocked } from '../../ui/NotificationSettings';
import { dimPressed } from '../../ui/press';
import { colors, SLIM_H, SLIM_SLOP } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

// 물을 차례면 몇 번째로 묻는지(처음이면 false, 다시 묻는 거면 true), 아니면 null
export async function notifyAskTurn(): Promise<{ again: boolean } | null> {
  if (!notificationsAvailable) return null;
  const [settings, ask] = await Promise.all([readSettings(AsyncStorage), readAskState(AsyncStorage)]);
  return askDue(settings, ask, logicalDate(new Date())) ? { again: ask.declines > 0 } : null;
}

// 하루 마무리를 남긴 뒤 붙는 포스트잇. 받기를 누르면 시스템 권한 창을 띄우고 네 알림을 모두 켠다.
// "괜찮아요"(또는 권한 거절)는 3일 뒤, 7일 뒤에 다시 묻고 세 번째에는 그만 묻는다(스펙 "알림").
export function NotifyAsk({ db, again, onDone }: { db: Db; again: boolean; onDone: () => void }) {
  const decline = () => recordDecline(AsyncStorage, logicalDate(new Date())).catch(() => {});
  const accept = async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted') {
      await writeSettings(AsyncStorage, { enabled: true, kinds: ALL_ON }).catch(() => {});
      void rescheduleNotifications(db);
    } else {
      await decline();
      if (result === 'blocked') alertNotificationsBlocked();
    }
    onDone();
  };
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <View style={styles.tape} accessible={false} />
      <Txt variant="handLg" style={styles.title}>
        {again ? '알림 받아 볼래요?' : '내일도 살짝 불러 드릴까요?'}
      </Txt>
      <Txt style={styles.body}>
        {again
          ? '아침·저녁에 살짝만 불러 드려요. 설정에서 언제든 끌 수 있어요.'
          : '아침 8시에 오늘 장을, 평일 저녁 6시에 남은 일을, 밤 10시에 마무리를 알려 드려요. 설정에서 언제든 끌 수 있어요.'}
      </Txt>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed([styles.button, styles.primary])} onPress={() => void accept()}>
          <Txt variant="medium" style={styles.primaryText}>
            알림 받기
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={SLIM_SLOP}
          style={dimPressed([styles.button, styles.secondary])}
          onPress={() => {
            void decline();
            onDone();
          }}
        >
          <Txt style={styles.secondaryText}>괜찮아요</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: 8,
    backgroundColor: colors.postit,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tape: { position: 'absolute', top: -10, alignSelf: 'center', width: 72, height: 20, backgroundColor: colors.tape, transform: [{ rotate: '-2deg' }] },
  title: { color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.postitText },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  button: { flexGrow: 1, flexBasis: 120, minHeight: SLIM_H, borderRadius: SLIM_H / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: colors.navy },
  primaryText: { fontSize: 14, color: colors.onDark },
  secondary: { borderWidth: 1, borderColor: colors.chipBorder },
  secondaryText: { fontSize: 14, color: colors.inkSoft },
});
