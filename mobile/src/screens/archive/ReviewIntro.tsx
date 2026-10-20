import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { listMonthSummary } from '../../archive/repo';
import type { Db } from '../../db/types';
import { monthLabel } from '../../monthly/labels';
import { CELL_MS, introWeeks, LINE_MS, lineDelay, REVIEW_INTRO_COPY, REVIEW_TEASERS } from '../../monthly/reviewIntro';
import { EASE_OUT } from '../../ui/motion';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { inkNeedsLightText, inkOpacity, inkSize } from './ink';
import { BLOT } from './InkDot';

type Props = { db: Db; month: string };

const INK_MIN = 14;
const INK_MAX = 30;
const CELL_H = 34;
const RISE = 8;

// 처음 월간 돌아보기를 만들기 전 머리(ReviewIntro 목업): 그 달의 실제 기분으로 잉크 달력이 날짜 순서대로 번지고,
// 무엇을 읽어 주는지 세 줄이 올라온다. 한 번만 움직이고 멈춘다. 동작 줄이기면 다 번진 모습만 보여 준다.
export function ReviewIntro({ db, month }: Props) {
  const reduce = useReduceMotion();
  const label = monthLabel(month);
  const [moods, setMoods] = useState<Map<string, number | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMonthSummary(db, month)
      .then((days) => !cancelled && setMoods(new Map(days.map((d) => [d.date, d.mood]))))
      .catch(() => !cancelled && setMoods(new Map())); // 못 읽으면 잉크 없는 달력
    return () => {
      cancelled = true;
    };
  }, [db, month]);

  const weeks = useMemo(() => introWeeks(month, moods ?? new Map()), [month, moods]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Txt variant="hand" style={styles.hand}>
          {REVIEW_INTRO_COPY.hand}
        </Txt>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          {REVIEW_INTRO_COPY.title(label)}
        </Txt>
      </View>

      <View style={styles.card} accessible accessibilityLabel={`${label} 기분 달력`}>
        <Txt variant="title" style={styles.cardTitle}>
          {REVIEW_INTRO_COPY.ink}
        </Txt>
        {/* 기분을 다 읽은 뒤에 한 번에 시작한다(읽는 동안은 빈 달력) */}
        <View style={styles.grid} key={moods ? 'ready' : 'wait'}>
          {weeks.map((week, row) => (
            <View key={row} style={styles.week}>
              {week.map((c, col) => (
                <View key={c?.date ?? `e${row}-${col}`} style={styles.cell}>
                  {c && <InkCell day={c.day} mood={c.mood} delay={c.delay} play={!!moods && !reduce} />}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.lines} accessible accessibilityLabel={REVIEW_TEASERS.map((t) => `${t.label}: ${t.text}`).join(', ')}>
        {REVIEW_TEASERS.map((t, i) => (
          <Rise key={t.label} delay={lineDelay(month, i)} play={!!moods && !reduce} ready={!!moods}>
            <View style={styles.line}>
              <Txt variant="medium" style={styles.lineLabel}>
                {t.label}
              </Txt>
              {'hand' in t ? (
                <Txt variant="hand" style={styles.lineHand}>
                  {t.text}
                </Txt>
              ) : (
                <Txt style={styles.lineText}>{t.text}</Txt>
              )}
            </View>
          </Rise>
        ))}
      </View>
    </View>
  );
}

// 한 칸: 날짜 뒤 잉크가 0에서 제 크기로 번진다. 가장 진한 날은 잉크가 차오르며 숫자가 밝아진다
function InkCell({ day, mood, delay, play }: { day: number; mood: number | null; delay: number; play: boolean }) {
  const v = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play || mood === null) return;
    const anim = Animated.timing(v, { toValue: 1, duration: CELL_MS, delay, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // 마운트할 때 한 번만
  }, []);
  const size = mood === null ? 0 : inkSize(mood, INK_MIN, INK_MAX);
  const light = inkNeedsLightText(mood);
  return (
    <>
      {mood !== null && (
        <Animated.View pointerEvents="none" style={[styles.ink, { width: size, height: size, marginTop: -size / 2, marginLeft: -size / 2, transform: [{ scale: v }] }]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={BLOT} fill={colors.navy} fillOpacity={inkOpacity(mood)} />
          </Svg>
        </Animated.View>
      )}
      <Txt style={[styles.num, mood !== null && styles.numOnInk]}>{day}</Txt>
      {light && (
        <Animated.View pointerEvents="none" style={[styles.numOver, { opacity: v }]}>
          <Txt style={[styles.num, styles.numLight]}>{day}</Txt>
        </Animated.View>
      )}
    </>
  );
}

function Rise({ delay, play, ready, children }: { delay: number; play: boolean; ready: boolean; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current; // 기분을 다 읽기 전에는 숨겨 둔다
  useEffect(() => {
    if (!ready) return;
    if (!play) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const anim = Animated.timing(v, { toValue: 1, duration: LINE_MS, delay, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [ready, play, delay, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 18 },
  head: { gap: 6 },
  hand: { color: colors.noteRed },
  title: { fontSize: 26, lineHeight: 34 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 12 },
  cardTitle: { fontSize: 15, marginHorizontal: 4, marginBottom: 6 },
  grid: { gap: 2 },
  week: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, minWidth: 0, height: CELL_H, alignItems: 'center', justifyContent: 'center' },
  ink: { position: 'absolute', top: '50%', left: '50%' },
  num: { fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  numOnInk: { color: colors.ink }, // 옅은 잉크 위 muted는 대비가 모자라다(MonthlyReview와 같다)
  numLight: { color: colors.onDark },
  numOver: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  lines: { gap: 10 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  lineLabel: { fontSize: 13, color: colors.navy, width: 82 },
  lineText: { flex: 1, fontSize: 15, color: colors.ink },
  lineHand: { flex: 1, fontSize: 20, lineHeight: 26, color: colors.navy },
});
