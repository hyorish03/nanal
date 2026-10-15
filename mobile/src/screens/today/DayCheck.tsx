import { Pressable, StyleSheet, View } from 'react-native';
import { formatMonthDay } from '../../lib/date';
import { dimPressed } from '../../ui/press';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { colors, HIT } from '../../ui/theme';

// 그날 했어요(○): 넘어온 일을 옮기지 않고 원래 날짜에 끝낸 일로 남기는 버튼. 오늘 포스트잇·월초 정리가 같이 쓴다.
// 누르면 ✓가 찬 채로 잠깐 남았다가(CHECKED_MS) 줄이 빠진다. 그동안 저장은 부르는 쪽이 한다.
export const DAY_CHECK = 22; // 보이는 동그라미 지름. 누르는 자리는 HIT(44)
export const CHECKED_MS = 1200; // ✓·줄긋기·'그날 했어요'를 보여 주는 시간

type Props = {
  text: string;
  date: string; // 원래 날짜
  checked: boolean;
  onPress: () => void;
};

export function DayCheck({ text, date, checked, onPress }: Props) {
  if (checked) {
    // 누른 뒤에는 더 누를 것이 없다. 줄의 '그날 했어요'와 토스트가 읽힌다
    return (
      <View style={styles.hit} accessible={false}>
        <StatusSymbol kind="done" size={DAY_CHECK} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}, ${formatMonthDay(date)}에 한 일로 체크`}
      accessibilityHint="옮기지 않고 그날 장에 끝낸 일로 남겨요"
      style={dimPressed(styles.hit)}
      onPress={onPress}
    >
      <View style={styles.circle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 보이는 동그라미는 줄 왼쪽 끝에 맞추고, 누르는 자리만 44로 넓힌다
  hit: { width: HIT, height: HIT, marginLeft: -(HIT - DAY_CHECK) / 2, alignItems: 'center', justifyContent: 'center' },
  circle: { width: DAY_CHECK, height: DAY_CHECK, borderRadius: DAY_CHECK / 2, borderWidth: 1.5, borderColor: colors.navy },
});
