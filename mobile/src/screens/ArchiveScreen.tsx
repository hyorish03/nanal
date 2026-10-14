import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutRectangle, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { calendarPaneWidth, isTwoPane } from '../archive/layout';
import { type ArchiveEntry, type DaySummary, lastPlannedDate, listMonthSummary, listReflectionFilters, listReflectionPage, type ReflectionFilter } from '../archive/repo';
import type { Db } from '../db/types';
import { listItemsForDate, type Item } from '../items/repo';
import { logicalDate, monthOf } from '../lib/date';
import { userMessage } from '../lib/userError';
import { deleteReflection, listReflections, type Reflection, updateReflection } from '../reflections/repo';
import { monthLabel, reviewTargetMonth } from '../monthly/labels';
import { listMonthLeftovers } from '../monthly/ritual';
import { canOfferReview, loadReviewOffer, type ReviewOffer } from '../monthly/reviewOffer';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { Chip } from '../ui/Chip';
import { PageHeader } from '../ui/PageHeader';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { useReduceMotion } from '../ui/useReduceMotion';
import { confirmDelete, showActionSheet } from '../ui/dialogs';
import { DayDetail, type Editing } from './archive/DayDetail';
import { EntryCard } from './archive/EntryCard';
import { MonthCalendar } from './archive/MonthCalendar';
import { SomedayList } from './archive/SomedayList';
import { hasAnswer } from './evening/draft';
import { useKeepVisible } from './evening/useKeepVisible';

type Props = {
  db: Db;
  version: number;
  onClose: () => void;
  onOpenReview?: (month: string) => void;
  onOpenMonthRitual?: () => void; // 월초 정리를 1일이 아니어도 열 수 있는 입구
  onChanged?: () => void;
};
type Tab = 'calendar' | 'collection' | 'someday';

const TABS = [
  ['calendar', '달력'],
  ['collection', '회고 모아보기'],
  ['someday', '언젠가'], // 날짜 없이 언젠가 할 일 한 목록(SomedayList)
] as const;
const PAGE = 20; // 회고 모아보기를 한 번에 읽는 개수
const LOAD_ERROR = '기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요';

// 화면이 가려져 있는 동안(월간 돌아보기 아래 등)에는 바뀐 판을 붙들어 두었다가, 다시 보일 때 한 번에 읽는다.
function useFocusedVersion(version: number): number {
  const focused = useIsFocused();
  const seen = useRef(version);
  if (focused) seen.current = version;
  return seen.current;
}

export function ArchiveScreen({ db, version: rawVersion, onClose, onOpenReview, onOpenMonthRitual, onChanged }: Props) {
  const focusedVersion = useFocusedVersion(rawVersion);
  const [tick, setTick] = useState(0); // 여기서 회고를 고치거나 지우면 바로 다시 읽는다
  const version = `${focusedVersion}:${tick}`; // 아래 읽기들이 다시 돌 기준
  const today = logicalDate(new Date());
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [lastPlanned, setLastPlanned] = useState<string | null>(null); // 앞날로 미뤄 둔 할 일 중 가장 먼 날
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
  const [editing, setEditing] = useState<Editing | null>(null); // 고치는 중인 회고
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);

  const reviewMonth = reviewTargetMonth(today);
  const [reviewOffer, setReviewOffer] = useState<ReviewOffer>({ hasReview: false, recordedDays: 0 });
  const hasReview = reviewOffer.hasReview;
  const [leftovers, setLeftovers] = useState(0); // 지난달까지 끝내지 못한 일 수(월초 정리 입구를 보일지)

  useEffect(() => {
    let cancelled = false;
    loadReviewOffer(db, reviewMonth)
      .then((o) => !cancelled && setReviewOffer(o))
      .catch(() => {});
    listMonthLeftovers(db, today)
      .then((l) => !cancelled && setLeftovers(l.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, reviewMonth, today, version]);

  useEffect(() => {
    let cancelled = false;
    lastPlannedDate(db, today)
      .then((d) => !cancelled && setLastPlanned(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

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
  const day = byDate.get(selected);
  const total = filters.reduce((n, f) => n + f.count, 0);
  const current = filters.find((f) => f.id === filter);
  const changeMonth = (next: string) => {
    setMonth(next);
    setSelected(next === monthOf(today) ? today : `${next}-01`);
  };

  // 아이패드·Mac: 머리를 위에 두고, 넓으면 달력(왼쪽)과 날짜 상세(오른쪽)를 따로 스크롤한다
  const layout = useLayoutClass();
  const large = layout !== 'compact';
  const screen = useWindowDimensions();
  const [width, setWidth] = useState(large ? screen.width - WIDE.sidebarWidth : screen.width);
  const twoPane = isTwoPane(layout, width);
  const calendarWidth = calendarPaneWidth(width - WIDE.pageX * 2);

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
    if (twoPane) {
      scrollRef.current?.scrollTo({ y: 0, animated: false }); // 오른쪽 상세는 새 날의 맨 위부터
      return;
    }
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

  const showBanner = !!onOpenReview && canOfferReview(reviewOffer);
  // 넓은 화면의 글 칸: 두 칸이면 왼쪽 여백에 붙이고, 한 칸이면 가운데에 읽기 폭으로 모은다
  const column = large ? [styles.page, !twoPane && styles.centered] : null;

  const head = (
    <>
      <PageHeader title="지난 기록" onBack={onClose} />

      <View accessibilityRole="tablist" style={[styles.tabs, large && styles.tabsLarge]}>
        {TABS.map(([key, label], i) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={`${label}, ${i + 1}/${TABS.length}`}
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
  // 넓은 화면에서는 머리를 스크롤 밖 위에 고정한다(두 탭이 같은 자리)
  const fixedHead = large && <View style={[column, styles.fixedHead]}>{head}</View>;

  const banner = showBanner && onOpenReview && (
    <Pressable accessibilityRole="button" style={dimPressed(styles.reviewBanner)} onPress={() => onOpenReview(reviewMonth)}>
      <Txt variant="medium" style={styles.reviewBannerTitle}>
        {monthLabel(reviewMonth)} 돌아보기 {hasReview ? '보기' : '만들기'}
      </Txt>
      <Txt style={styles.reviewBannerSub}>{hasReview ? '지난달 흐름을 다시 읽어요' : '한 달의 기분과 회고를 같이 읽어 봐요'}</Txt>
    </Pressable>
  );

  // 이번 달을 보고 있고 지난달에서 넘어온 일이 있으면, 달력 바로 위에 월초 정리 입구를 조용히 둔다
  const ritualLink = onOpenMonthRitual && leftovers > 0 && month === monthOf(today) && (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`지난달 정리하기, 넘어온 일 ${leftovers}개`}
      hitSlop={{ top: 4, bottom: 4 }}
      style={dimPressed(styles.ritualLink)}
      onPress={onOpenMonthRitual}
    >
      <Txt variant="small" style={styles.ritualLinkText}>
        지난달 정리하기 · {leftovers}개
      </Txt>
    </Pressable>
  );

  const calendar = (
    <MonthCalendar
      month={month}
      today={today}
      lastMonth={lastPlanned && lastPlanned > today ? monthOf(lastPlanned) : monthOf(today)}
      selected={selected}
      byDate={byDate}
      large={large}
      onPick={pickDate}
      onChangeMonth={changeMonth}
    />
  );

  const detail = (divided: boolean) => (
    <DayDetail
      date={selected}
      day={day}
      future={selected > today}
      items={dayItems}
      reflections={dayReflections}
      editing={editing}
      actionError={actionError}
      large={large}
      divided={divided}
      keep={keep}
      onEditChange={(key, v) => setEditing((e) => e && { ...e, answers: { ...e.answers, [key]: v } })}
      onSaveEdit={saveEdit}
      onCancelEdit={() => setEditing(null)}
      onStartEdit={startEdit}
      onDeleteReflection={askDeleteReflection}
      onReflectionActions={reflectionActions}
      onLayout={
        divided
          ? (e) => {
              detailBox.current = e.nativeEvent.layout;
              if (Date.now() < revealUntil.current) revealDetail();
            }
          : undefined
      }
    />
  );

  const measure = (w: number) => {
    if (Math.abs(w - width) > 1) setWidth(w);
  };

  // 언젠가: 모아보기와 같은 자리·폭. 줄 밀기와 스크롤을 조율하는 목록과 되돌리기 토스트는 SomedayList가 가진다
  if (tab === 'someday') {
    return (
      <View style={styles.flex} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        <Paper />
        {fixedHead}
        <SomedayList
          db={db}
          version={version}
          head={!large && head}
          contentStyle={[styles.container, column, large && styles.listLarge, styles.somedayContent]}
          onChanged={onChanged}
        />
      </View>
    );
  }

  if (tab === 'collection') {
    return (
      <View style={styles.flex} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        <Paper />
        {fixedHead}
        <FlatList
          style={styles.scroll}
          contentContainerStyle={[styles.container, column, large && styles.listLarge]}
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EntryCard entry={item} large={large} onOpenDay={openDay} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.listHead}>
              {!large && head}
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

  if (twoPane) {
    return (
      <View ref={frame} style={styles.flex} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        <Paper />
        {fixedHead}
        <View style={styles.panes}>
          <ScrollView style={{ width: calendarWidth, flexGrow: 0 }} contentContainerStyle={styles.pane}>
            {banner}
            {ritualLink}
            {calendar}
          </ScrollView>
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.scroll}
            contentContainerStyle={[styles.pane, styles.detailPane]}
            scrollEventThrottle={16}
            onScroll={keepOnScroll}
          >
            {detail(false)}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View ref={frame} style={styles.flex} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
      <Paper />
      {fixedHead}
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scroll}
        contentContainerStyle={[styles.container, column, large && styles.stackLarge]}
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
        {!large && head}
        {banner}
        {ritualLink}
        {calendar}
        {detail(true)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 4, paddingBottom: 40, gap: 14 },
  page: { width: '100%', paddingHorizontal: WIDE.pageX },
  centered: { maxWidth: WIDE.readingWidth + WIDE.pageX * 2, alignSelf: 'center' },
  fixedHead: { paddingTop: 4, paddingBottom: 12, gap: 14 },
  stackLarge: { paddingTop: 8, gap: 24 },
  listLarge: { paddingTop: 8, gap: 16, maxWidth: WIDE.readingWidth + WIDE.pageX * 2 },
  panes: { flex: 1, flexDirection: 'row', paddingHorizontal: WIDE.pageX, gap: WIDE.gutter },
  pane: { paddingTop: 8, paddingBottom: 40, gap: 20 },
  detailPane: { maxWidth: WIDE.readingWidth },
  listHead: { gap: 14 },
  somedayContent: { gap: 0, flexGrow: 1 }, // 줄 사이를 띄우지 않는다(공책 줄)
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tabsLarge: { maxWidth: 520 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.navy },
  tabText: { fontSize: 15 },
  tabTextOff: { color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  reviewBanner: { minHeight: 64, padding: 14, gap: 2, borderRadius: 6, backgroundColor: colors.navy },
  reviewBannerTitle: { color: colors.onDark, fontSize: 16 },
  reviewBannerSub: { color: colors.coverText, fontSize: 13 },
  ritualLink: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  ritualLinkText: { color: colors.navy, textDecorationLine: 'underline' },
  small: { fontSize: 13, color: colors.inkSoft },
  muted: { fontSize: 14, color: colors.muted },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 },
});
