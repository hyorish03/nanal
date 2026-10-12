import { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import type { Item } from '../../items/repo';
import { formatShortDate } from '../../lib/date';
import { EASE_OUT } from '../../ui/motion';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { dimPressed } from '../../ui/press';

export type SettleHow = 'today' | 'tomorrow' | 'delete';

type Props = {
  candidates: Item[];
  // 저장소 작업을 실행하고 성공 여부를 돌려준다(실패 문구는 화면이 보여준다).
  onSettle: (item: Item, how: SettleHow) => Promise<boolean>;
};

export function PostIt({ candidates, onSettle }: Props) {
  const reduce = useReduceMotion();
  const peel = useRef(new Animated.Value(0)).current;
  const leaving = useRef(new Set<string>()).current;

  const settle = async (item: Item, how: SettleHow, row: Animated.Value) => {
    if (leaving.has(item.id)) return;
    leaving.add(item.id);
    const last = candidates.filter((c) => !leaving.has(c.id)).length === 0;
    if (!reduce) {
      const anims = [Animated.timing(row, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true })];
      // 마지막 줄이면 줄이 빠지기 시작한 뒤에 포스트잇을 뗀다
      if (last) {
        const lift = Animated.timing(peel, { toValue: 1, duration: 500, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true });
        anims.push(Animated.sequence([Animated.delay(120), lift]));
      }
      await new Promise<void>((resolve) => Animated.parallel(anims).start(() => resolve()));
    }
    // 목록이 당겨지는 레이아웃 애니메이션은 화면이 다시 불러온 목록을 넣기 직전에 건다(TodayScreen)
    const ok = await onSettle(item, how);
    leaving.delete(item.id);
    if (!ok) {
      row.setValue(0);
      peel.setValue(0);
    }
  };

  const rotate = peel.interpolate({ inputRange: [0, 1], outputRange: ['-1deg', '8deg'] });
  const translateX = peel.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const translateY = peel.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const opacity = peel.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.note, { opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
      <Txt variant="hand" accessibilityRole="header" style={styles.title}>
        어제에서 넘어온 일이 있어요
      </Txt>
      {candidates.map((c) => (
        <CandidateRow key={c.id} item={c} onSettle={settle} />
      ))}
    </Animated.View>
  );
}

function CandidateRow({ item, onSettle }: { item: Item; onSettle: (item: Item, how: SettleHow, row: Animated.Value) => void }) {
  const row = useRef(new Animated.Value(0)).current;
  const translateX = row.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const opacity = row.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateX }] }]}>
      <Txt style={styles.text}>
        • {item.text} <Txt style={styles.from}>{formatShortDate(item.date)}</Txt>
      </Txt>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 오늘 하기`}
          style={dimPressed(styles.action)}
          onPress={() => onSettle(item, 'today', row)}
        >
          <Txt variant="medium" style={styles.today}>
            오늘 하기
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 내일로`}
          style={dimPressed(styles.action)}
          onPress={() => onSettle(item, 'tomorrow', row)}
        >
          <Txt style={styles.tomorrow}>내일로</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 지우기`}
          style={dimPressed(styles.remove)}
          onPress={() => onSettle(item, 'delete', row)}
        >
          <Txt style={styles.removeText}>×</Txt>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: colors.postit,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderRadius: 2,
    gap: 4,
    transformOrigin: 'top right',
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  title: { fontSize: 24, color: colors.ink },
  row: { paddingVertical: 6, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.inkDash },
  text: { fontSize: 15 },
  from: { fontSize: 12, color: colors.postitText },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  today: { fontSize: 14, color: colors.navy },
  tomorrow: { fontSize: 14, color: colors.inkSoft },
  remove: { marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 20, color: colors.postitText },
});
