import { useIsFocused } from '@react-navigation/native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutRectangle, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { type ArchiveEntry, type DaySummary, listMonthSummary, listReflectionFilters, listReflectionPage, type ReflectionFilter } from '../archive/repo';
import { moodWord } from '../days/moods';
import type { Db } from '../db/types';
import { listItemsForDate, type Item } from '../items/repo';
import { monthWeeks } from '../lib/calendar';
import { addMonths, formatLongDate, formatMonth, logicalDate, monthOf } from '../lib/date';
import { userMessage } from '../lib/userError';
import { deleteReflection, listReflections, type Reflection, updateReflection } from '../reflections/repo';
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
import { confirmDelete, showActionSheet } from '../ui/dialogs';
import { hasAnswer } from './evening/draft';
import { ReflectionForm } from './evening/ReflectionForm';
import { useKeepVisible } from './evening/useKeepVisible';

type Props = { db: Db; version: number; onClose: () => void; onOpenReview?: (month: string) => void; onChanged?: () => void };
type Tab = 'calendar' | 'collection';

const TABS = [
  ['calendar', '달력'],
  ['collection', '회고 모아보기'],
] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const REVIEW_MIN_DAYS = 7; // 돌아보기 배너는 지난달에 이만큼은 기록했을 때만 띄운다
const PAGE = 20; // 회고 모아보기를 한 번에 읽는 개수
const DAY_ITEMS_MAX = 10; // 날짜 상세에 보이는 할 일·메모 수(나머지는 "외 N개")
const LOAD_ERROR = '기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요';

function answersOf(r: Reflection): string[] {
  return r.questions.map((q) => r.answers[q.key]).filter((a): a is string => !!a);
}

// 화면이 가려져 있는 동안(월간 돌아보기 아래 등)에는 바뀐 판을 붙들어 두었다가, 다시 보일 때 한 번에 읽는다.
function useFocusedVersion(version: number): number {
  const focused = useIsFocused();
  const seen = useRef(version);
  if (focused) seen.current = version;
  return seen.current;
}

export function ArchiveScreen({ db, version: rawVersion, onClose, onOpenReview, onChanged }: Props) {
  const focusedVersion = useFocusedVersion(rawVersion);
  const [tick, setTick] = useState(0); // 여기서 회고를 고치거나 지우면 바로 다시 읽는다
  const version = `${focusedVersion}:${tick}`; // 아래 읽기들이 다시 돌 기준
  const today = logicalDate(new Date());
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [dayReflections, setDayReflections] = useState<Reflection[]>([]);
  const [dayItems, setDayItems] = useState<Item[]>([]);
  const [filters, setFilters] = useState<ReflectionFilter[]>([]);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const loading = useRef(false);
  const loaded = useRef(0); // 지금까지 읽은 회고 수(판이 바뀌면 이만큼 다시 읽어 스크롤이 튀지 않게)
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = useCallback(() => setError(LOAD_ERROR), []);
  const [editing, setEditing] = useState<{ id: string; answers: Record<string, string> } | null>(null); // 고치는 중인 회고
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);

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
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [db, month, version, fail]);

  useEffect(() => {
    let cancelled = false;
    listReflections(db, selected)
      .then((r) => !cancelled && setDayReflections(r))
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [db, selected, version, fail]);

  useEffect(() => {
    let cancelled = false;
    listItemsForDate(db, selected)
      .then((i) => !cancelled && setDayItems(i))
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [db, selected, version, fail]);

  // 모아보기를 처음 열거나 거르기·판이 바뀌면 첫 쪽부터(이미 더 읽었으면 그만큼) 다시 읽는다
  useEffect(() => {
    if (tab !== 'collection') return;
    let cancelled = false;
    const want = Math.max(PAGE, loaded.current);
    loading.current = true;
    Promise.all([listReflectionFilters(db), listReflectionPage(db, { limit: want, template: filter })])
      .then(([f, page]) => {
        if (cancelled) return;
        setFilters(f);
        setEntries(page);
        setHasMore(page.length === want);
        loaded.current = page.length;
      })
      .catch(fail)
      .finally(() => {
        if (!cancelled) loading.current = false;
      });
    return () => {
      cancelled = true;
      loading.current = false;
    };
  }, [db, tab, filter, version, fail]);

  const loadMore = useCallback(() => {
    if (loading.current || !hasMore) return;
    loading.current = true;
    const offset = loaded.current;
    listReflectionPage(db, { limit: PAGE, offset, template: filter })
      .then((page) => {
        if (loaded.current !== offset) return; // 그사이 처음부터 다시 읽었다
        setEntries((prev) => [...prev, ...page]);
        setHasMore(page.length === PAGE);
        loaded.current = offset + page.length;
      })
      .catch(fail)
      .finally(() => {
        loading.current = false;
      });
  }, [db, filter, hasMore, fail]);

  const pickFilter = (id: string | null) => {
    loaded.current = 0;
    setFilter(id);
  };

  const byDate = useMemo(() => new Map(summary.map((s) => [s.date, s])), [summary]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const day = byDate.get(selected);
  const total = filters.reduce((n, f) => n + f.count, 0);
  const current = filters.find((f) => f.id === filter);
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
    setEditing(null);
    setActionError(null);
    revealUntil.current = Date.now() + 1000;
    requestAnimationFrame(revealDetail);
  };

  // 모아보기에서 회고를 누르면 달력으로 넘어가 그날을 골라 보여준다
  const openDay = useCallback((date: string) => {
    scrollY.current = 0;
    detailBox.current = null;
    revealUntil.current = Date.now() + 1000;
    setTab('calendar');
    setMonth(monthOf(date));
    setSelected(date);
    setEditing(null);
    setActionError(null);
  }, []);

  // 날짜 상세에서 회고를 고치거나 지운다. 끝나면 달력 점·모아보기까지 다시 읽는다.
  const frame = useRef<View>(null);
  const { onScroll: keepOnScroll, keep } = useKeepVisible(scrollRef, frame);
  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
      setActionError(null);
      setTick((t) => t + 1);
      onChanged?.();
    } catch (e) {
      setActionError(userMessage(e));
    } finally {
      busy.current = false;
    }
  };
  const startEdit = (r: Reflection) => {
    setActionError(null);
    setEditing({ id: r.id, answers: { ...r.answers } });
  };
  const saveEdit = () => {
    if (!editing || !hasAnswer(editing.answers)) return;
    const { id, answers } = editing;
    run(async () => {
      await updateReflection(db, id, answers);
      setEditing(null);
    });
  };
  const askDeleteReflection = (r: Reflection) =>
    confirmDelete(`‘${r.templateName}’ 회고를 지울까요?`, '지운 회고는 되돌릴 수 없어요.', () =>
      run(async () => {
        await deleteReflection(db, r.id);
        setEditing((e) => (e?.id === r.id ? null : e));
      }),
    );
  const reflectionActions = (r: Reflection) =>
    showActionSheet(`‘${r.templateName}’`, [
      { label: '고치기', onPress: () => startEdit(r) },
      { label: '지우기', destructive: true, onPress: () => askDeleteReflection(r) },
    ]);

  const showBanner = !!onOpenReview && (hasReview || reviewDays >= REVIEW_MIN_DAYS);
  const shownItems = dayItems.slice(0, DAY_ITEMS_MAX);
  const hiddenItems = dayItems.length - shownItems.length;

  const head = (
    <>
      <PageHeader title="지난 기록" onBack={onClose} />

      <View style={styles.tabs}>
        {TABS.map(([key, label], i) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${label}, 탭, ${i + 1}/${TABS.length}`}
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

      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}
    </>
  );

  if (tab === 'collection') {
    return (
      <View style={styles.flex}>
        <Paper />
        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.container}
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EntryCard entry={item} onOpenDay={openDay} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.listHead}>
              {head}
              <View style={styles.filters}>
                {[{ id: null, name: '전체' }, ...filters].map((f) => (
                  <Chip key={f.id ?? 'all'} label={f.name} selected={filter === f.id} onPress={() => pickFilter(f.id)} />
                ))}
              </View>
              <Txt style={styles.small}>
                {current ? `${current.name} ${current.count}개` : total ? `회고 ${total}개` : '아직 남긴 회고가 없어요'}
              </Txt>
              {!filter && total === 0 && <Txt style={styles.muted}>하루 마무리에서 남긴 회고가 여기 모여요</Txt>}
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View ref={frame} style={styles.flex}>
      <Paper />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={styles.container}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          keepOnScroll(e);
        }}
        onLayout={(e) => {
          viewH.current = e.nativeEvent.layout.height;
          if (Date.now() < revealUntil.current) revealDetail();
        }}
      >
        {head}

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
              {hasReview ? '지난달 흐름을 다시 읽어요' : '한 달의 기분과 회고를 같이 읽어 봐요'}
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
              <Txt key={w} maxFontSizeMultiplier={1.4} style={[styles.cell, styles.weekday]}>
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
                const isToday = date === today;
                const word = moodWord(s?.mood ?? null);
                const d = Number(date.slice(8));
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={`${Number(date.slice(5, 7))}월 ${d}일${isToday ? ', 오늘' : ''}${word ? `, 기분 ${word}` : ''}${s?.hasReflection ? ', 회고 있음' : ''}`}
                    accessibilityState={{ selected: on, disabled: future }}
                    disabled={future}
                    style={dimPressed([styles.cell, styles.dayCell, on && styles.dayOn])}
                    onPress={() => pickDate(date)}
                  >
                    <View style={[styles.dayNumBox, isToday && styles.todayRing]}>
                      <Txt
                        variant={isToday ? 'medium' : 'body'}
                        maxFontSizeMultiplier={1.4}
                        style={[styles.dayNum, isToday && styles.today, future && styles.future]}
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
        <Txt style={styles.legend}>잉크가 찰수록 기분이 좋았던 날이에요. 아래 점은 회고를 남긴 날이에요.</Txt>

        <View
          style={styles.detail}
          onLayout={(e) => {
            detailBox.current = e.nativeEvent.layout;
            if (Date.now() < revealUntil.current) revealDetail();
          }}
        >
          <View style={styles.detailHead}>
            <Txt variant="title" accessibilityRole="header" style={styles.detailTitle}>
              {formatLongDate(selected)}
            </Txt>
            <Txt style={styles.small}>{day?.mood ? `기분 · ${moodWord(day.mood)}` : '기분 기록 없음'}</Txt>
          </View>
          <Txt style={styles.small}>
            {!day
              ? '기록이 없는 날이에요'
              : day.tasksTotal === 0
                ? day.tasksMigrated > 0
                  ? '다른 날로 넘긴 일만 있어요'
                  : '이 날은 할 일을 적지 않았어요'
                : `할 일 ${day.tasksTotal}개 중 ${day.tasksDone}개를 끝냈어요${day.tasksMigrated > 0 ? `, ${day.tasksMigrated}개는 다른 날로 넘겼어요` : ''}`}
          </Txt>
          {shownItems.length > 0 && (
            <View style={styles.items}>
              {shownItems.map((it) => {
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
              {hiddenItems > 0 && <Txt style={styles.muted}>외 {hiddenItems}개</Txt>}
            </View>
          )}
          {dayReflections.length === 0 ? (
            <Txt style={styles.muted}>이 날은 회고가 없어요</Txt>
          ) : (
            dayReflections.map((r) =>
              editing?.id === r.id ? (
                <ReflectionForm
                  key={r.id}
                  title={r.templateName}
                  questions={r.questions}
                  values={editing.answers}
                  onChange={(key, v) => setEditing((e) => e && { ...e, answers: { ...e.answers, [key]: v } })}
                  submitLabel="고쳐 두기"
                  canSubmit={hasAnswer(editing.answers)}
                  onSubmit={saveEdit}
                  onCancel={() => setEditing(null)}
                  keep={keep}
                  style={styles.card}
                />
              ) : (
                // 카드를 길게 눌러도 고치기·지우기가 나온다. 글은 줄마다 따로 읽히도록 카드 자체는 접근성 요소로 묶지 않는다.
                <Pressable key={r.id} accessible={false} onLongPress={() => reflectionActions(r)}>
                  <RuledPaper lineHeight={30} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Txt variant="hand" style={[styles.cardTitle, styles.flexText]}>
                        {r.templateName}
                      </Txt>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`‘${r.templateName}’ 회고 고치기 또는 지우기`}
                        accessibilityActions={[
                          { name: 'edit', label: '고치기' },
                          { name: 'delete', label: '지우기' },
                        ]}
                        onAccessibilityAction={(e) => {
                          if (e.nativeEvent.actionName === 'edit') startEdit(r);
                          else if (e.nativeEvent.actionName === 'delete') askDeleteReflection(r);
                        }}
                        hitSlop={{ top: 7, bottom: 7 }}
                        style={dimPressed(styles.more)}
                        onPress={() => reflectionActions(r)}
                      >
                        <Txt style={styles.moreText}>⋯</Txt>
                      </Pressable>
                    </View>
                    {answersOf(r).map((a, i) => (
                      <Txt key={i} style={styles.cardLine}>
                        {a}
                      </Txt>
                    ))}
                  </RuledPaper>
                </Pressable>
              ),
            )
          )}
          {actionError && (
            <Txt style={styles.error} accessibilityLiveRegion="polite">
              {actionError}
            </Txt>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// 모아보기의 회고 한 장. 질문 아래에 답을 적고, 누르면 달력에서 그날을 연다.
const EntryCard = memo(function EntryCard({ entry, onOpenDay }: { entry: ArchiveEntry; onOpenDay: (date: string) => void }) {
  const date = formatLongDate(entry.date);
  const mood = moodWord(entry.mood);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="달력에서 이 날을 열어요"
      style={dimPressed(styles.entry)}
      onPress={() => onOpenDay(entry.date)}
    >
      <View style={styles.entryHead}>
        <Txt variant="hand" style={styles.entryTitle}>
          {entry.templateName}
        </Txt>
        <Txt style={styles.entryMeta}>
          {date} · 기분 {mood ?? '-'}
        </Txt>
      </View>
      {entry.answers.map((qa, i) => (
        <View key={i} style={styles.qa}>
          <Txt style={styles.entryQuestion}>{qa.question}</Txt>
          <Txt style={styles.entryLine}>{qa.answer}</Txt>
        </View>
      ))}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 4, paddingBottom: 40, gap: 14 },
  listHead: { gap: 14 },
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
  // 글씨를 키우면 동그라미도 따라 커진다(숫자가 잘리지 않게)
  dayNumBox: { minWidth: 28, minHeight: 28, paddingHorizontal: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
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
  cardHead: { flexDirection: 'row', alignItems: 'center', height: 30 },
  flexText: { flex: 1 },
  more: { width: 44, height: 30, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, color: colors.muted },
  cardLine: { fontSize: 14, lineHeight: 30 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 },
  entry: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4, padding: 12, gap: 8 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryTitle: { fontSize: 20, flexShrink: 1 },
  entryMeta: { fontSize: 12, color: colors.muted },
  qa: { gap: 2 },
  entryQuestion: { fontSize: 13, lineHeight: 19, color: colors.muted },
  entryLine: { fontSize: 14, lineHeight: 22 },
});
