import { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutRectangle, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { reflectionFilters } from '../archive/filters';
import { type DaySummary, listMonthSummary } from '../archive/repo';
import { moodWord } from '../days/moods';
import type { Db } from '../db/types';
import { listItemsForDate, type Item } from '../items/repo';
import { monthWeeks } from '../lib/calendar';
import { addMonths, formatLongDate, formatMonth, logicalDate, monthOf } from '../lib/date';
import { listReflectionHistory, listReflections, type Reflection, type ReflectionEntry } from '../reflections/repo';
import { monthLabel, reviewTargetMonth } from '../monthly/labels';
import { getMonthlyReview } from '../monthly/repo';
import { Inkwell } from '../ui/Inkwell';
import { StatusSymbol } from '../ui/StatusSymbol';
import { symbolKind } from '../ui/symbols';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { Chip } from '../ui/Chip';
import { PageHeader } from '../ui/PageHeader';
import { useReduceMotion } from '../ui/useReduceMotion';

type Props = { db: Db; version: number; onClose: () => void; onOpenReview?: (month: string) => void };
type Tab = 'calendar' | 'collection';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const REVIEW_MIN_DAYS = 7; // 돌아보기 배너는 지난달에 이만큼은 기록했을 때만 띄운다

function answersOf(r: Reflection): string[] {
  return r.questions.map((q) => r.answers[q.key]).filter((a): a is string => !!a);
}

export function ArchiveScreen({ db, version, onClose, onOpenReview }: Props) {
  const today = logicalDate(new Date());
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [dayReflections, setDayReflections] = useState<Reflection[]>([]);
  const [dayItems, setDayItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<ReflectionEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewMonth = reviewTargetMonth(today);
  const [hasReview, setHasReview] = useState(false);
  const [reviewDays, setReviewDays] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMonthlyReview(db, reviewMonth)
      .then((r) => !cancelled && setHasReview(r !== null))
      .catch(() => {});
    listMonthSummary(db, reviewMonth)
      .then((s) => !cancelled && setReviewDays(s.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, reviewMonth, version]);

  useEffect(() => {
    let cancelled = false;
    listMonthSummary(db, month)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, month, version]);

  useEffect(() => {
    let cancelled = false;
    listReflections(db, selected)
      .then((r) => !cancelled && setDayReflections(r))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, selected, version]);

  useEffect(() => {
    let cancelled = false;
    listItemsForDate(db, selected)
      .then((i) => !cancelled && setDayItems(i))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, selected, version]);

  useEffect(() => {
    if (tab !== 'collection') return;
    let cancelled = false;
    listReflectionHistory(db)
      .then((h) => !cancelled && setHistory(h))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, tab, version]);

  const byDate = useMemo(() => new Map(summary.map((s) => [s.date, s])), [summary]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const day = byDate.get(selected);
  const filters = useMemo(() => reflectionFilters(history), [history]);
  const entries = filter ? history.filter((h) => h.template === filter) : history;
  const filterName = filters.find((f) => f.id === filter)?.name;
  const changeMonth = (next: string) => {
    setMonth(next);
    setSelected(next === monthOf(today) ? today : `${next}-01`);
  };
  const isCurrentMonth = month >= monthOf(today);

  // 날짜를 누르면 아래 상세가 화면 안에 들어오도록 내린다(달력은 되도록 남긴다)
  const reduce = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const detailBox = useRef<LayoutRectangle | null>(null);
  const revealUntil = useRef(0); // 상세 높이가 바뀌어도(회고를 불러온 뒤) 잠깐은 다시 맞춘다
  const revealDetail = () => {
    const box = detailBox.current;
    if (!box || !viewH.current) return;
    const target = Math.max(0, Math.min(box.y - 12, box.y + box.height + 24 - viewH.current));
    if (target > scrollY.current + 4) scrollRef.current?.scrollTo({ y: target, animated: !reduce });
  };
  const pickDate = (date: string) => {
    setSelected(date);
    revealUntil.current = Date.now() + 1000;
    requestAnimationFrame(revealDetail);
  };
  const showBanner = !!onOpenReview && (hasReview || reviewDays >= REVIEW_MIN_DAYS);

  return (
    <View style={styles.flex}>
      <Paper />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.container}
        scrollEventThrottle={16}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
      >
        <PageHeader title="지난 기록" onBack={onClose} />

        <View accessibilityRole="tablist" style={styles.tabs}>
          {(
            [
              ['calendar', '달력'],
              ['collection', '회고 모아보기'],
            ] as const
          ).map(([key, label]) => {
            const on = tab === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={dimPressed([styles.tab, on && styles.tabOn])}
                onPress={() => setTab(key)}
              >
                <Txt variant={on ? 'medium' : 'body'} style={[styles.tabText, !on && styles.tabTextOff]}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {error && <Txt style={styles.error}>{error}</Txt>}

        {tab === 'calendar' && (
          <>
            {showBanner && onOpenReview && (
              <Pressable
                accessibilityRole="button"
                style={dimPressed(styles.reviewBanner)}
                onPress={() => onOpenReview(reviewMonth)}
              >
                <Txt variant="medium" style={styles.reviewBannerTitle}>
                  {monthLabel(reviewMonth)} 돌아보기 {hasReview ? '보기' : '만들기'}
                </Txt>
                <Txt style={styles.reviewBannerSub}>
                  {hasReview ? '지난달 흐름을 다시 읽어요' : '한 달의 기분과 회고를 AI와 같이 읽어 봐요'}
                </Txt>
              </Pressable>
            )}
            <View style={styles.monthRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="이전 달" style={dimPressed(styles.arrow)} onPress={() => changeMonth(addMonths(month, -1))}>
                <Txt style={styles.arrowText}>‹</Txt>
              </Pressable>
              <Txt variant="title" style={styles.monthText}>
                {formatMonth(month)}
              </Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 달"
                accessibilityState={{ disabled: isCurrentMonth }}
                disabled={isCurrentMonth}
                style={dimPressed(styles.arrow)}
                onPress={() => changeMonth(addMonths(month, 1))}
              >
                <Txt style={[styles.arrowText, isCurrentMonth && styles.arrowOff]}>›</Txt>
              </Pressable>
            </View>
            <View style={styles.grid}>
              <View style={styles.week}>
                {WEEKDAYS.map((w) => (
                  <Txt key={w} style={[styles.cell, styles.weekday]}>
                    {w}
                  </Txt>
                ))}
              </View>
              {weeks.map((week, row) => (
                <View key={row} style={styles.week}>
                  {week.map((date, col) => {
                    if (!date) return <View key={`b${col}`} style={styles.cell} />;
                    const s = byDate.get(date);
                    const future = date > today;
                    const on = date === selected;
                    const word = moodWord(s?.mood ?? null);
                    const d = Number(date.slice(8));
                    return (
                      <Pressable
                        key={date}
                        accessibilityRole="button"
                        accessibilityLabel={`${Number(date.slice(5, 7))}월 ${d}일${word ? `, 기분 ${word}` : ''}${s?.hasReflection ? ', 회고 있음' : ''}`}
                        accessibilityState={{ selected: on, disabled: future }}
                        disabled={future}
                        style={dimPressed([styles.cell, styles.dayCell, on && styles.dayOn])}
                        onPress={() => pickDate(date)}
                      >
                        <View style={[styles.dayNumBox, date === today && styles.todayRing]}>
                          <Txt
                            variant={date === today ? 'medium' : 'body'}
                            style={[styles.dayNum, date === today && styles.today, future && styles.future]}
                          >
                            {d}
                          </Txt>
                        </View>
                        {s?.mood && <Inkwell id={`cal${date}`} mood={s.mood} size="small" />}
                        <View style={[styles.dot, s?.hasReflection && styles.dotOn]} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            <Txt style={styles.legend}>잉크가 찰수록 좋았던 날. 아래 점은 회고를 남긴 날이에요.</Txt>

            <View
              style={styles.detail}
              onLayout={(e) => {
                detailBox.current = e.nativeEvent.layout;
                if (Date.now() < revealUntil.current) revealDetail();
              }}
            >
              <View style={styles.detailHead}>
                <Txt variant="title" style={styles.detailTitle}>
                  {formatLongDate(selected)}
                </Txt>
                <Txt style={styles.small}>{day?.mood ? `기분 · ${moodWord(day.mood)}` : '기분 기록 없음'}</Txt>
              </View>
              <Txt style={styles.small}>
                {!day
                  ? '기록이 없는 날이에요'
                  : day.tasksTotal === 0
                    ? day.tasksMigrated > 0
                      ? '다른 날로 옮긴 일만 있어요'
                      : '이 날은 할 일을 적지 않았어요'
                    : `할 일 ${day.tasksTotal}개 중 ${day.tasksDone}개 끝냄${day.tasksMigrated > 0 ? `, ${day.tasksMigrated}개는 다른 날로` : ''}`}
              </Txt>
              {dayItems.length > 0 && (
                <View style={styles.items}>
                  {dayItems.map((it) => {
                    const k = symbolKind(it);
                    const done = k === 'done';
                    const moved = k === 'migrated';
                    return (
                      <View key={it.id} style={styles.itemRow}>
                        <StatusSymbol kind={k} size={16} />
                        <Txt style={[styles.itemText, done && styles.itemDone, moved && styles.itemMoved]}>{it.text}</Txt>
                      </View>
                    );
                  })}
                </View>
              )}
              {dayReflections.length === 0 ? (
                <Txt style={styles.muted}>이 날은 회고를 남기지 않았어요. 괜찮아요.</Txt>
              ) : (
                dayReflections.map((r) => (
                  <RuledPaper key={r.id} lineHeight={30} style={styles.card}>
                    <Txt variant="hand" style={styles.cardTitle}>
                      {r.templateName}
                    </Txt>
                    {answersOf(r).map((a, i) => (
                      <Txt key={i} style={styles.cardLine}>
                        {a}
                      </Txt>
                    ))}
                  </RuledPaper>
                ))
              )}
            </View>
          </>
        )}

        {tab === 'collection' && (
          <>
            <View style={styles.filters}>
              {[{ id: null, name: '전체' }, ...filters].map((f) => {
                const on = filter === f.id;
                return (
                  <Chip key={f.id ?? 'all'} label={f.name} selected={on} onPress={() => setFilter(f.id)} />
                );
              })}
            </View>
            <Txt style={styles.small}>
              {filter ? `${filterName} ${entries.length}번` : history.length ? `회고 ${history.length}개` : '아직 남긴 회고가 없어요'}
            </Txt>
            {!filter && history.length === 0 && <Txt style={styles.muted}>하루 마무리에서 남긴 회고가 여기 모여요</Txt>}
            {entries.map((e) => (
              <View key={e.id} style={styles.entry}>
                <View style={styles.entryHead}>
                  <Txt variant="hand" style={styles.entryTitle}>
                    {e.templateName}
                  </Txt>
                  <Txt style={styles.entryMeta}>
                    {formatLongDate(e.date)} · 기분 {moodWord(e.mood) ?? '-'}
                  </Txt>
                </View>
                {answersOf(e).map((a, i) => (
                  <Txt key={i} style={styles.entryLine}>
                    {a}
                  </Txt>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 4, paddingBottom: 40, gap: 14 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.navy },
  tabText: { fontSize: 15 },
  tabTextOff: { color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18, color: colors.muted },
  arrowOff: { color: colors.lineSoft },
  monthText: { fontSize: 18 },
  grid: { gap: 2 },
  week: { flexDirection: 'row' }, // 한 주에 꼭 7칸. 칸은 똑같이 나눠 가져서 줄이 넘치지 않는다
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingBottom: 4 },
  dayCell: { minHeight: 52, paddingVertical: 4, borderRadius: 8, gap: 2 },
  dayOn: { backgroundColor: colors.chipSelected },
  dayNumBox: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  todayRing: { borderColor: colors.navy },
  dayNum: { fontSize: 13 },
  today: { color: colors.navy },
  future: { color: colors.line },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOn: { backgroundColor: colors.navy },
  reviewBanner: { minHeight: 64, padding: 14, gap: 2, borderRadius: 6, backgroundColor: colors.navy },
  reviewBannerTitle: { color: colors.onDark, fontSize: 16 },
  reviewBannerSub: { color: colors.coverText, fontSize: 13 },
  legend: { fontSize: 12, color: colors.muted },
  detail: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  detailTitle: { fontSize: 20 },
  small: { fontSize: 13, color: colors.inkSoft },
  items: { gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemText: { flex: 1, fontSize: 14, lineHeight: 20 },
  itemDone: { textDecorationLine: 'line-through', color: colors.muted },
  itemMoved: { color: colors.muted },
  muted: { fontSize: 14, color: colors.muted },
  card: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4 },
  cardTitle: { fontSize: 21, lineHeight: 30 },
  cardLine: { fontSize: 14, lineHeight: 30 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 },
  entry: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4, padding: 12, gap: 6 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryTitle: { fontSize: 20, flexShrink: 1 },
  entryMeta: { fontSize: 12, color: colors.muted },
  entryLine: { fontSize: 14, lineHeight: 22 },
});
