import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { monthWeeks } from '../../lib/calendar';
import { addDays, addMonths, formatDayWithWeekday, formatMonth, monthOf } from '../../lib/date';
import { postponeChoices } from '../../lib/postpone';
import { EASE_OUT } from '../../ui/motion';
import { dimPressed, tintPressed } from '../../ui/press';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { colors, HIT } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';

type Props = {
  visible: boolean;
  today: string; // 논리 날짜
  onPick: (date: string) => void;
  onClose: () => void;
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SHEET_MAX = 520; // 아이패드·Mac에서 시트 글 폭

// 미루기를 누르면 아래에서 올라오는 작은 종이 시트: 언제로 미룰지 고른다(퓨처 로그).
// 빠른 선택(내일·주말·다음 주 월요일) 한 번이면 끝나고, '날짜 고르기'를 누르면 그 자리에 달력이 펼쳐진다.
export function PostponeSheet({ visible, today, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { height } = useWindowDimensions();
  const show = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [calendar, setCalendar] = useState(false);
  const firstMonth = monthOf(addDays(today, 1)); // 그믐날에는 내일이 있는 다음 달부터
  const [month, setMonth] = useState(firstMonth);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setCalendar(false);
      setMonth(firstMonth);
    }
    Animated.timing(show, { toValue: visible ? 1 : 0, duration: reduce ? 0 : visible ? 260 : 180, easing: EASE_OUT, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !visible) setMounted(false);
      },
    );
    // firstMonth는 today에서 나온다. 열릴 때마다 처음 모양으로
  }, [visible, reduce, show]);

  const choices = useMemo(() => postponeChoices(today), [today]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const lift = show.interpolate({ inputRange: [0, 1], outputRange: [Math.max(480, height * 0.7), 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: show }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, { maxHeight: height - insets.top - 24, transform: [{ translateY: lift }] }]}
      >
        <ScrollView bounces={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          <Txt variant="hand" accessibilityRole="header" style={styles.title}>
            언제로 미룰까요?
          </Txt>

          {choices.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}, ${formatDayWithWeekday(c.date)}`}
              style={tintPressed(styles.choice)}
              onPress={() => onPick(c.date)}
            >
              <StatusSymbol kind="migrated" size={16} />
              <Txt style={styles.choiceLabel}>{c.label}</Txt>
              <Txt style={styles.choiceDate}>{formatDayWithWeekday(c.date)}</Txt>
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: calendar }}
            style={tintPressed([styles.choice, styles.last])}
            onPress={() => setCalendar((v) => !v)}
          >
            {/* 작은 달력 한 장(펜 선) */}
            <Svg width={16} height={16} viewBox="0 0 16 16" accessible={false}>
              <Rect x={1.5} y={3} width={13} height={11.5} rx={1.5} fill="none" stroke={colors.inkSoft} strokeWidth={1.3} />
              <Path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" stroke={colors.inkSoft} strokeWidth={1.3} strokeLinecap="round" />
            </Svg>
            <Txt style={styles.choiceLabel}>날짜 고르기</Txt>
            <Txt style={styles.choiceDate}>{calendar ? '접기' : ''}</Txt>
          </Pressable>

          {calendar && (
            <View style={styles.calendar}>
              <View style={styles.monthRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이전 달"
                  accessibilityState={{ disabled: month <= firstMonth }}
                  disabled={month <= firstMonth}
                  style={dimPressed(styles.arrow)}
                  onPress={() => setMonth(addMonths(month, -1))}
                >
                  <Txt style={[styles.arrowText, month <= firstMonth && styles.off]}>‹</Txt>
                </Pressable>
                <Txt variant="title" style={styles.monthText}>
                  {formatMonth(month)}
                </Txt>
                <Pressable accessibilityRole="button" accessibilityLabel="다음 달" style={dimPressed(styles.arrow)} onPress={() => setMonth(addMonths(month, 1))}>
                  <Txt style={styles.arrowText}>›</Txt>
                </Pressable>
              </View>
              <View style={styles.week}>
                {WEEKDAYS.map((w) => (
                  <Txt key={w} maxFontSizeMultiplier={1.3} style={[styles.cell, styles.weekday]}>
                    {w}
                  </Txt>
                ))}
              </View>
              {weeks.map((week, row) => (
                <View key={row} style={styles.week}>
                  {week.map((date, col) => {
                    if (!date) return <View key={`b${col}`} style={styles.cell} />;
                    // 오늘과 지난 날은 고를 수 없다(오늘 장에 이미 있다)
                    const off = date <= today;
                    const d = Number(date.slice(8));
                    return (
                      <Pressable
                        key={date}
                        accessibilityRole="button"
                        accessibilityLabel={formatDayWithWeekday(date)}
                        accessibilityState={{ disabled: off }}
                        disabled={off}
                        style={dimPressed([styles.cell, styles.day])}
                        onPress={() => onPick(date)}
                      >
                        <Txt maxFontSizeMultiplier={1.3} style={[styles.dayNum, off && styles.off]}>
                          {d}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(42, 37, 32, 0.3)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  content: { paddingHorizontal: 24, paddingTop: 12, width: '100%', maxWidth: SHEET_MAX, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 12 },
  title: { marginBottom: 6 },
  // 공책 줄처럼 아래에 옅은 선을 긋는다
  choice: {
    minHeight: Math.max(HIT, 52),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ruled,
  },
  last: { borderBottomWidth: 0 },
  choiceLabel: { flex: 1, fontSize: 16 },
  choiceDate: { fontSize: 14, color: colors.muted },
  calendar: { marginTop: 4, paddingTop: 10, gap: 2, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18, color: colors.muted },
  monthText: { fontSize: 18 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingBottom: 4 },
  day: { minHeight: HIT, justifyContent: 'center', borderRadius: 8 },
  dayNum: { fontSize: 15, color: colors.ink },
  off: { color: colors.line }, // 지난 기록 달력의 앞날 숫자와 같은 흐림
});
