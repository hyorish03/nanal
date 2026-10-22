import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Db } from '../../db/types';
import { ALL_OFF, ALL_ON } from '../../notifications/plan';
import { readPrefs, writePrefs } from '../../notifications/prefs';
import { notificationsAvailable, requestNotificationPermission, rescheduleNotifications } from '../../notifications/scheduler';
import { dimPressed } from '../../ui/press';
import { colors, SLIM_H, SLIM_SLOP } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

// 알림을 아직 켜지도 끄지도 않았다(한 번만 묻는다)
export async function shouldAskNotifications(): Promise<boolean> {
  return notificationsAvailable && (await readPrefs(AsyncStorage)) === null;
}

// 하루 마무리를 처음 남긴 뒤 붙는 포스트잇. 받기를 누르면 시스템 권한 창을 띄우고 네 알림을 모두 켠다.
// 어느 쪽을 골라도 값을 남겨 다시 묻지 않는다(계정 메뉴에서 바꾼다).
export function NotifyAsk({ db, onDone }: { db: Db; onDone: () => void }) {
  const answer = async (want: boolean) => {
    const granted = want && (await requestNotificationPermission()) === 'granted';
    await writePrefs(AsyncStorage, granted ? ALL_ON : ALL_OFF).catch(() => {});
    void rescheduleNotifications(db);
    onDone();
  };
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <View style={styles.tape} accessible={false} />
      <Txt variant="handLg" style={styles.title}>
        내일도 살짝 불러 드릴까요?
      </Txt>
      <Txt style={styles.body}>아침 8시에 오늘 장을, 평일 저녁 6시에 남은 일을, 밤 10시에 마무리를 알려 드려요. 계정 메뉴에서 언제든 끌 수 있어요.</Txt>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed([styles.button, styles.primary])} onPress={() => void answer(true)}>
          <Txt variant="medium" style={styles.primaryText}>
            알림 받기
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed([styles.button, styles.secondary])} onPress={() => void answer(false)}>
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
