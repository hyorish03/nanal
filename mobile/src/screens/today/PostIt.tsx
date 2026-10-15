import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { carryGroupLabel, groupByDate, takeRows } from '../../items/carryOver';
import type { Item } from '../../items/repo';
import { haptic } from '../../ui/haptics';
import { EASE_OUT } from '../../ui/motion';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { dimPressed } from '../../ui/press';
import { CHECKED_MS, DayCheck } from './DayCheck';

// today: 오늘 할 일로 옮긴다 · done: 그날 했어요(원래 날짜에 끝낸 일로) · delete: 지우기
export type SettleHow = 'today' | 'done' | 'delete';

export const POSTIT_SHOWN = 3; // 처음에 보여 주는 줄 수(묶음을 건너 센다). 나머지는 '외 N개'로 접는다

type Props = {
  candidates: Item[];
  today: string; // 논리 날짜. 묶음 머리의 '어제·그저께·N일 전'을 센다
  // 저장소 작업을 실행하고 성공 여부를 돌려준다(실패 문구는 화면이 보여준다).
  onSettle: (item: Item, how: SettleHow) => Promise<boolean>;
  onSettleAll: () => Promise<boolean>; // 모두 오늘 하기
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function PostIt({ candidates, today, onSettle, onSettleAll }: Props) {
  const reduce = useReduceMotion();
  const peel = useRef(new Animated.Value(0)).current;
  const leaving = useRef(new Set<string>()).current;
  const [expanded, setExpanded] = useState(false);
  // 그날 했어요를 눌러 ✓로 잠깐 남아 있는 줄
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  // 빠진 줄의 표시는 버린다(되돌리기로 같은 줄이 돌아오면 다시 빈 ○로)
  useEffect(() => {
    setChecked((prev) => {
      const ids = new Set(candidates.map((c) => c.id));
      return [...prev].every((id) => ids.has(id)) ? prev : new Set([...prev].filter((id) => ids.has(id)));
    });
  }, [candidates]);
  // 원래 날짜별로, 가까운 날(어제) 묶음부터. 접을 때는 그 순서로 앞에서부터 센다
  const groups = groupByDate(candidates, 'newest');
  const hidden = expanded ? 0 : Math.max(0, candidates.length - POSTIT_SHOWN);
  const shown = hidden > 0 ? takeRows(groups, POSTIT_SHOWN) : groups;

  const setRowChecked = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // 모두 오늘로: 줄마다 빼지 않고 포스트잇을 통째로 뗀다
  const settleAll = async () => {
    if (leaving.size > 0) return;
    candidates.forEach((c) => leaving.add(c.id));
    if (!reduce) {
      await new Promise<void>((resolve) =>
        Animated.timing(peel, { toValue: 1, duration: 500, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }).start(() =>
          resolve(),
        ),
      );
    }
    const ok = await onSettleAll();
    leaving.clear();
    if (!ok) peel.setValue(0);
  };

  const settle = async (item: Item, how: SettleHow, row: Animated.Value) => {
    if (leaving.has(item.id)) return;
    leaving.add(item.id);
    if (how === 'done') {
      // ✓·줄긋기·'그날 했어요'를 잠깐 보여 준 뒤에 다른 정리처럼 줄을 뺀다(동작 줄이기여도 보여 주기는 한다)
      haptic.select();
      setRowChecked(item.id, true);
      await wait(CHECKED_MS);
    }
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
      setRowChecked(item.id, false);
    }
  };

  const rotate = peel.interpolate({ inputRange: [0, 1], outputRange: ['-1deg', '8deg'] });
  const translateX = peel.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const translateY = peel.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const opacity = peel.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.note, { opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
      <View style={styles.head}>
        <Txt variant="hand" accessibilityRole="header" style={styles.title}>
          지난 날에서 넘어온 일
        </Txt>
        <Txt variant="hand" style={styles.hint}>
          그날 했으면 ○를 눌러 체크해요
        </Txt>
      </View>
      {shown.map((g) => (
        <View key={g.date} style={styles.group}>
          <Txt variant="medium" accessibilityRole="header" style={styles.groupHead}>
            {carryGroupLabel(g.date, today)}
          </Txt>
          {g.items.map((c) => (
            <CandidateRow key={c.id} item={c} checked={checked.has(c.id)} onSettle={settle} />
          ))}
        </View>
      ))}
      {(hidden > 0 || candidates.length > 1) && (
        <View style={styles.footer}>
          {hidden > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`외 ${hidden}개 더 보기`}
              style={dimPressed(styles.action)}
              onPress={() => setExpanded(true)}
            >
              <Txt style={styles.more}>외 {hidden}개</Txt>
            </Pressable>
          )}
          {candidates.length > 1 && (
            <Pressable accessibilityRole="button" style={dimPressed([styles.action, styles.all])} onPress={settleAll}>
              <Txt variant="medium" style={styles.today}>
                모두 오늘 하기
              </Txt>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

type RowProps = {
  item: Item;
  checked: boolean;
  onSettle: (item: Item, how: SettleHow, row: Animated.Value) => void;
};

function CandidateRow({ item, checked, onSettle }: RowProps) {
  const row = useRef(new Animated.Value(0)).current;
  const translateX = row.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const opacity = row.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateX }] }]}>
      <DayCheck text={item.text} date={item.date} checked={checked} onPress={() => onSettle(item, 'done', row)} />
      {/* 글자를 키워 한 줄에 다 안 들어가면 글은 줄을 바꾸고, 버튼은 잘리지 않고 다음 줄 오른쪽으로 내려간다 */}
      <View style={styles.body}>
        <Txt style={[styles.text, checked && styles.textChecked]}>{item.text}</Txt>
        {checked ? (
          <Txt style={styles.didIt}>그날 했어요</Txt>
        ) : (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.text}, 오늘 하기`}
              style={dimPressed(styles.action)}
              onPress={() => onSettle(item, 'today', row)}
            >
              <Txt variant="medium" style={styles.today}>
                오늘 하기
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.text}, 지우기`}
              style={dimPressed(styles.remove)}
              onPress={() => onSettle(item, 'delete', row)}
            >
              <Txt style={styles.removeText}>×</Txt>
            </Pressable>
          </View>
        )}
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
    gap: 10,
    transformOrigin: 'top right',
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  head: { gap: 0 },
  title: { fontSize: 24, color: colors.ink },
  hint: { fontSize: 18, color: colors.noteRed },
  group: { gap: 0 },
  groupHead: {
    fontSize: 13,
    color: colors.postitText,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: colors.inkDash,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 44 },
  // 글은 남는 폭을 다 쓰되, 너무 좁아지면(넓은 배치의 오른쪽 칸·큰 글자) 버튼을 다음 줄로 보낸다
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 96, fontSize: 16, paddingVertical: 10 },
  textChecked: { textDecorationLine: 'line-through', color: colors.postitText, opacity: 0.75 },
  didIt: { marginLeft: 'auto', paddingLeft: 8, fontSize: 13, color: colors.postitText },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  action: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  today: { fontSize: 14, color: colors.navy },
  more: { fontSize: 14, color: colors.inkSoft },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.inkDash },
  all: { marginLeft: 'auto' },
  remove: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 20, color: colors.postitText },
});
