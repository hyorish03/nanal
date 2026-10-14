import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hasPlanned } from '../../archive/layout';
import type { DaySummary } from '../../archive/repo';
import { moodWord } from '../../days/moods';
import { monthWeeks } from '../../lib/calendar';
import { addMonths, formatMonth } from '../../lib/date';
import { dimPressed } from '../../ui/press';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { inkNeedsLightText } from './ink';
import { InkDot } from './InkDot';
import { textBox } from './metrics';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  month: string;
  today: string;
  lastMonth: string; // 다음 달로 넘길 수 있는 마지막 달(앞날로 미뤄 둔 할 일이 있는 달까지)
  selected: string;
  byDate: Map<string, DaySummary>;
  large: boolean; // 아이패드·Mac: 숫자와 칸을 키운다
  onPick: (date: string) => void;
  onChangeMonth: (month: string) => void;
};

// 지난 기록의 달력: 달 넘기기, 7칸 주 줄, 범례
export function MonthCalendar({ month, today, lastMonth, selected, byDate, large, onPick, onChangeMonth }: Props) {
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const isLastMonth = month >= lastMonth;
  const anyPlanned = useMemo(() => [...byDate.values()].some((d) => d.date > today && hasPlanned(d)), [byDate, today]);
  const s = large ? big : small;
  const numBox = textBox(large ? 36 : 30);
  // 날짜 뒤 잉크 지름(기분 1→5). 휴대폰은 칸 폭(약 49pt)에 거의 꽉 차게
  const [inkMin, inkMax] = (large ? [24, 56] : [18, 44]).map(textBox);

  return (
    <View style={s.root}>
      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" style={dimPressed(styles.arrow)} onPress={() => onChangeMonth(addMonths(month, -1))}>
          <Txt style={[styles.arrowText, s.arrowText]}>‹</Txt>
        </Pressable>
        <Txt variant="title" style={s.monthText}>
          {formatMonth(month)}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          accessibilityState={{ disabled: isLastMonth }}
          disabled={isLastMonth}
          style={dimPressed(styles.arrow)}
          onPress={() => onChangeMonth(addMonths(month, 1))}
        >
          <Txt style={[styles.arrowText, s.arrowText, isLastMonth && styles.arrowOff]}>›</Txt>
        </Pressable>
      </View>
      <View style={s.grid}>
        <View style={styles.week}>
          {WEEKDAYS.map((w) => (
            <Txt key={w} maxFontSizeMultiplier={1.4} style={[styles.cell, styles.weekday, s.weekday]}>
              {w}
            </Txt>
          ))}
        </View>
        {weeks.map((week, row) => (
          <View key={row} style={[styles.week, s.week]}>
            {week.map((date, col) => {
              if (!date) return <View key={`b${col}`} style={styles.cell} />;
              const sum = byDate.get(date);
              const future = date > today;
              const planned = future && hasPlanned(sum); // 앞날로 미뤄 둔 할 일이 있는 날: 눌러서 볼 수 있다
              const on = date === selected;
              const isToday = date === today;
              const word = moodWord(sum?.mood ?? null);
              const light = inkNeedsLightText(sum?.mood ?? null); // 가장 진한 잉크 위에서는 숫자를 밝게
              const d = Number(date.slice(8));
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${Number(date.slice(5, 7))}월 ${d}일${isToday ? ', 오늘' : ''}${word ? `, 기분 ${word}` : ''}${sum?.hasReflection ? ', 회고 있음' : ''}${planned ? ', 할 일 있음' : ''}`}
                  accessibilityState={{ selected: on, disabled: future && !planned }}
                  disabled={future && !planned}
                  style={dimPressed([styles.cell, s.dayCell, on && styles.dayOn])}
                  onPress={() => onPick(date)}
                >
                  {/* 글씨를 키우면 동그라미도 따라 커진다(숫자가 잘리지 않게). 잉크는 숫자 뒤에 번진다 */}
                  <InkDot mood={sum?.mood ?? null} min={inkMin} max={inkMax}>
                    <View style={[styles.dayNumBox, { minWidth: numBox, minHeight: numBox, borderRadius: numBox / 2 }, isToday && styles.todayRing, isToday && light && styles.todayRingLight]}>
                      <Txt
                        variant={isToday ? 'medium' : 'body'}
                        maxFontSizeMultiplier={1.4}
                        style={[s.dayNum, isToday && styles.today, future && (planned ? styles.plannedNum : styles.future), light && styles.onInk]}
                      >
                        {d}
                      </Txt>
                    </View>
                  </InkDot>
                  {planned ? (
                    // 앞날의 할 일 표시: 옮긴 일 기호(›)를 작게. 잉크(기분)·고리(회고)와 모양이 달라 섞이지 않는다
                    <Svg width={s.mark.width} height={s.mark.height} viewBox="0 0 8 8" accessible={false}>
                      <Path d="M3 1.2 L5.8 4 L3 6.8" fill="none" stroke={colors.navy} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : (
                    <View style={[styles.ring, s.ring, sum?.hasReflection && styles.ringOn]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Txt style={s.legend}>
        날짜 뒤 잉크가 크고 진할수록 기분이 좋았던 날이에요. 숫자 아래 작은 고리는 회고를 남긴 날이에요.
        {anyPlanned ? ' 앞날 숫자 아래 › 는 할 일을 미뤄 둔 날이에요.' : ''}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: colors.muted },
  arrowOff: { color: colors.lineSoft },
  week: { flexDirection: 'row' }, // 한 주에 꼭 7칸. 칸은 똑같이 나눠 가져서 줄이 넘치지 않는다
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  weekday: { color: colors.muted, textAlign: 'center' },
  dayOn: { backgroundColor: colors.chipSelected },
  dayNumBox: { paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  todayRing: { borderColor: colors.navy },
  today: { color: colors.navy },
  future: { color: colors.line },
  plannedNum: { color: colors.inkSoft }, // 할 일이 있는 앞날은 눌러 볼 수 있어 흐리지 않게
  onInk: { color: colors.onDark },
  todayRingLight: { borderColor: colors.onDark },
  // 회고 표시는 속이 빈 고리로, 속이 찬 잉크 자국과 섞이지 않게
  ring: { borderWidth: 1.25, borderColor: 'transparent' },
  ringOn: { borderColor: colors.navy },
});

// 휴대폰: 예전 크기 그대로, 숫자만 15pt로
const small = StyleSheet.create({
  root: { gap: 14 },
  arrowText: { fontSize: 18 },
  monthText: { fontSize: 18 },
  grid: { gap: 2 },
  week: {},
  weekday: { fontSize: 12, paddingBottom: 4 },
  dayCell: { minHeight: 52, paddingVertical: 4, borderRadius: 8, gap: 2 },
  dayNum: { fontSize: 15 },
  ring: { width: 6, height: 6, borderRadius: 3 },
  mark: { width: 8, height: 8 },
  legend: { fontSize: 12, color: colors.muted },
});

// 아이패드·Mac: 칸 64pt 이상, 숫자 17pt, 요일 13pt
const big = StyleSheet.create({
  root: { gap: 16 },
  arrowText: { fontSize: 22 },
  monthText: { fontSize: 22 },
  grid: { gap: 4 },
  week: { gap: 4 },
  weekday: { fontSize: 13, paddingBottom: 6 },
  dayCell: { minHeight: 64, paddingVertical: 6, borderRadius: 10, gap: 3 },
  dayNum: { fontSize: 17 },
  ring: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5 },
  mark: { width: 9, height: 9 },
  legend: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
