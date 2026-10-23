import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { carryGroupLabel } from '../items/carryOver';
import {
  completeOnItsDay,
  DELAY_REASONS,
  type DelayReason,
  dropItem,
  type Item,
  migrateAllToToday,
  migrateToToday,
  reopen,
  undoDrop,
  undoMigration,
} from '../items/repo';
import { formatDayWithWeekday, logicalDate, monthOf } from '../lib/date';
import { userMessage } from '../lib/userError';
import { monthLabel, reviewTargetMonth } from '../monthly/labels';
import { type ChronicItem, chronicLabel, DELAY_REASON_LABELS, groupByDate, listMonthLeftoversSplit } from '../monthly/ritual';
import { canOfferReview, loadReviewOffer, type ReviewOffer } from '../monthly/reviewOffer';
import { Chip } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { colors, HIT, SCREEN_X, SLIM_H, SLIM_SLOP } from '../ui/theme';
import { Toast, type ToastSpec } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';
import { CHECKED_MS, DayCheck } from './today/DayCheck';

type Props = {
  db: Db;
  visible: boolean;
  onClose: () => void; // '나중에', 아래로 쓸어내리기, 다 정리한 뒤 저절로
  onChanged: () => void; // 옮기거나 지웠다(오늘 화면·위젯을 다시 그린다)
  onOpenReview: (month: string) => void;
};

const DONE_CLOSE_MS = 2200; // '새 달을 시작해요'를 읽을 틈(그사이 되돌리기를 누르면 닫지 않는다)
const SETTLE = LayoutAnimation.create(220, 'easeInEaseOut', 'opacity');

// 월초 정리(스펙 11.10). 새 달 첫 장에 지난달까지 끝내지 못한 일을 모아 한 줄씩 정한다.
// 두 달 넘게 넘어온 일은 '오래 머문 일' 카드에 따로 모아 왜 밀렸는지 칩으로 고르게 한다(골라도 안 골라도 된다).
// 고른 사유는 옮기거나 내려놓을 때 그 줄에 남는다. 처음 넘어온 일은 원래 날짜별로.
// 그날 했어요(○, 원래 날짜에 끝낸 일로) · 이번 달로(오늘 할 일로 옮긴다) · 내려놓기(안 하기, 줄을 그어 남긴다),
// 처음 넘어온 일만 한꺼번에 이번 달로, 나중에(닫기만 한다. 오늘 포스트잇에 그대로 남는다).
// 누르기 전에는 아무것도 바꾸지 않는다.
export function MonthRitualSheet({ db, visible, onClose, onChanged, onOpenReview }: Props) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const roomy = useLayoutClass() !== 'compact';
  // 시트를 여는 순간의 논리 날짜로 고정한다(열어 둔 채 새벽 4시를 넘겨도 제목이 바뀌지 않게)
  const [today, setToday] = useState(() => logicalDate(new Date()));
  const [chronic, setChronic] = useState<ChronicItem[]>([]);
  const [fresh, setFresh] = useState<Item[]>([]);
  // 오래 머문 일마다 고른 사유(아직 저장하지 않았다. 옮기거나 내려놓을 때 남긴다)
  const [reasons, setReasons] = useState<Readonly<Record<string, DelayReason>>>({});
  const [loaded, setLoaded] = useState(false);
  const [settledAny, setSettledAny] = useState(false); // 이 시트에서 하나라도 정리했다(다 비면 '새 달을 시작해요')
  const [offer, setOffer] = useState<ReviewOffer>({ hasReview: false, recordedDays: 0 });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const busy = useRef(false);
  // 그날 했어요를 눌러 ✓로 잠깐 남아 있는 줄(그동안 '모두 이번 달로'는 기다린다)
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const checking = useRef(new Set<string>());
  const lastMonth = reviewTargetMonth(today);

  const itemCount = chronic.length + fresh.length;

  const load = useCallback(
    (animate: boolean) =>
      listMonthLeftoversSplit(db, today).then((list) => {
        if (animate && !reduce) LayoutAnimation.configureNext(SETTLE);
        setChronic(list.chronic);
        setFresh(list.fresh);
        setLoaded(true);
      }),
    [db, today, reduce],
  );

  // 열 때마다 처음부터 읽는다
  useEffect(() => {
    if (!visible) return;
    const now = logicalDate(new Date());
    setToday(now);
    setLoaded(false);
    setSettledAny(false);
    setError(null);
    setToast(null);
    setChecked(new Set());
    setReasons({});
    checking.current.clear();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listMonthLeftoversSplit(db, today)
      .then((list) => {
        if (cancelled) return;
        setChronic(list.chronic);
        setFresh(list.fresh);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(userMessage(e));
        setLoaded(true);
      });
    loadReviewOffer(db, lastMonth)
      .then((o) => !cancelled && setOffer(o))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, db, today, lastMonth]);

  const done = loaded && settledAny && itemCount === 0 && !error;

  // 다 정리했으면 한 줄 남기고 잠시 뒤 닫는다. 되돌리기로 줄이 돌아오면 닫지 않는다.
  useEffect(() => {
    if (!done) return;
    haptic.success();
    AccessibilityInfo.announceForAccessibility('다 정리했어요. 새 달을 시작해요');
    const t = setTimeout(onClose, DONE_CLOSE_MS);
    return () => clearTimeout(t);
    // onClose는 매 렌더 새 함수라 의존성에서 뺀다
  }, [done]);

  // 저장소 작업을 하나씩 실행하고 목록을 다시 읽는다. 실패하면 문구만 보인다.
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
      setError(null);
      setSettledAny(true);
      onChanged();
      await load(true);
      return true;
    } catch (e) {
      setError(userMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const moveToToday = async (item: Item) => {
    const prev = item.status;
    if (prev !== 'open' && prev !== 'doing') return;
    let createdId = '';
    const ok = await run(async () => {
      createdId = (await migrateToToday(db, item.id, new Date(), reasons[item.id])).id;
    });
    if (ok && createdId) {
      haptic.light();
      setToast({
        key: Date.now(),
        message: '오늘로 옮겼어요',
        action: { label: '되돌리기', onPress: () => void run(() => undoMigration(db, createdId, prev)) },
      });
    }
  };

  const setRowChecked = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // 그날 했어요: ✓·줄긋기·'그날 했어요'를 잠깐 보여 준 뒤 저장하고 목록을 다시 읽는다(줄이 빠진다)
  const completeOnDay = async (item: Item) => {
    if (checking.current.has(item.id)) return;
    checking.current.add(item.id);
    haptic.select();
    setRowChecked(item.id, true);
    await new Promise<void>((resolve) => setTimeout(resolve, CHECKED_MS));
    let prev: 'open' | 'doing' = 'open';
    const ok = await run(async () => {
      prev = await completeOnItsDay(db, item.id);
    });
    checking.current.delete(item.id);
    // 성공하면 줄이 빠지고, 되돌리기로 돌아오면 다시 빈 ○로 보인다
    setRowChecked(item.id, false);
    if (ok) {
      setToast({
        key: Date.now(),
        message: `${formatDayWithWeekday(item.date)}에 한 일로 체크했어요`,
        action: { label: '되돌리기', onPress: () => void run(() => reopen(db, item.id, prev)) },
      });
    }
  };

  // 내려놓기: 지우지 않고 원래 날짜 장에 줄을 그어 남긴다(안 하기). 버리는 게 아니라 정리라서 실패처럼 보이지 않게
  const letGo = async (item: Item) => {
    let prev: 'open' | 'doing' = 'open';
    const ok = await run(async () => {
      prev = await dropItem(db, item.id, new Date(), reasons[item.id]);
    });
    if (ok) {
      haptic.light();
      setToast({ key: Date.now(), message: '내려놨어요', action: { label: '되돌리기', onPress: () => void run(() => undoDrop(db, item.id, prev)) } });
    }
  };

  const pickReason = (id: string, reason: DelayReason) => {
    haptic.select();
    setReasons((prev) => {
      const next = { ...prev };
      if (next[id] === reason) delete next[id];
      else next[id] = reason;
      return next;
    });
  };

  // 한꺼번에는 처음 넘어온 일만. 오래 머문 일은 하나씩 정한다
  const moveAll = () => checking.current.size === 0 && run(() => migrateAllToToday(db, fresh.map((i) => i.id)));

  const hideToast = useCallback((key: number) => setToast((t) => (t?.key === key ? null : t)), []);

  const openReview = () => {
    onClose();
    onOpenReview(lastMonth);
  };

  const groups = groupByDate(fresh);
  const showReview = canOfferReview(offer);

  return (
    <Modal
      visible={visible}
      animationType={reduce ? 'fade' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.flex} accessibilityViewIsModal>
        <Paper />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.sheet, roomy && styles.sheetRoomy, { paddingBottom: insets.bottom + 40 }]}
        >
          <View style={styles.top}>
            <Pressable accessibilityRole="button" accessibilityHint="닫아도 오늘 포스트잇에 그대로 남아요" style={dimPressed(styles.later)} onPress={onClose}>
              <Txt style={styles.laterText}>나중에</Txt>
            </Pressable>
          </View>

          <View style={styles.head}>
            {/* 제목은 잘리지 않고 줄을 바꾼다(numberOfLines를 두지 않는다) */}
            <Txt variant="display" accessibilityRole="header">
              {monthLabel(monthOf(today))} 첫 장
            </Txt>
            <Txt variant="handLg">지난달에서 넘어온 일을 정리해요</Txt>
            {!done && itemCount > 0 && (
              <Txt variant="small" style={styles.hint}>
                넘어온 일 {itemCount}개. 그날 했으면 ○를 눌러 체크하고, ‘이번 달로’는 오늘 할 일로 옮겨요
              </Txt>
            )}
          </View>

          {error && (
            <Txt style={styles.error} accessibilityRole="alert">
              {error}
            </Txt>
          )}

          {!loaded ? (
            <ActivityIndicator accessibilityLabel="불러오는 중" color={colors.navy} style={styles.loading} />
          ) : done ? (
            <Txt variant="handLg" style={styles.done} accessibilityLiveRegion="polite">
              새 달을 시작해요
            </Txt>
          ) : itemCount === 0 ? (
            <Txt style={styles.empty}>정리할 일이 없어요</Txt>
          ) : (
            <>
              {chronic.length > 0 && (
                <View style={styles.chronic}>
                  <View style={styles.chronicHead}>
                    <Txt variant="h2" accessibilityRole="header">
                      오래 머문 일 {chronic.length}개
                    </Txt>
                    <Txt variant="small" style={styles.chronicSub}>
                      왜 밀렸는지 하나 골라 봐요. 안 골라도 괜찮아요
                    </Txt>
                  </View>
                  {chronic.map((c, i) => (
                    <ChronicRow
                      key={c.item.id}
                      entry={c}
                      last={i === chronic.length - 1}
                      checked={checked.has(c.item.id)}
                      reason={reasons[c.item.id]}
                      onPick={pickReason}
                      onDone={completeOnDay}
                      onToday={moveToToday}
                      onLetGo={letGo}
                    />
                  ))}
                </View>
              )}
              {chronic.length > 0 && fresh.length > 0 && (
                <Txt variant="label" accessibilityRole="header" style={styles.freshHead}>
                  처음 넘어온 일
                </Txt>
              )}
              {fresh.length > 1 && (
                <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed(styles.all)} onPress={moveAll}>
                  <Txt variant="medium" style={styles.allText}>
                    {chronic.length > 0 ? '처음 넘어온 일 모두 이번 달로' : '모두 이번 달로'}
                  </Txt>
                </Pressable>
              )}
              {groups.map((g) => (
                <View key={g.date} style={styles.group}>
                  <Txt variant="label" accessibilityRole="header" style={styles.date}>
                    {carryGroupLabel(g.date, today)}
                  </Txt>
                  {g.items.map((item) => (
                    <LeftoverRow
                      key={item.id}
                      item={item}
                      checked={checked.has(item.id)}
                      onDone={completeOnDay}
                      onToday={moveToToday}
                      onLetGo={letGo}
                    />
                  ))}
                </View>
              ))}
            </>
          )}

          {loaded && showReview && (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="월간 돌아보기로 넘어가요"
              style={dimPressed(styles.review)}
              onPress={openReview}
            >
              <Txt variant="medium" style={styles.reviewTitle}>
                {monthLabel(lastMonth)} 돌아보기 {offer.hasReview ? '보기' : '만들기'}
              </Txt>
              <Txt style={styles.reviewSub}>{offer.hasReview ? '지난달 흐름을 다시 읽어요' : '한 달의 기분과 회고를 같이 읽어 봐요'}</Txt>
            </Pressable>
          )}
        </ScrollView>
        <Toast toast={toast} onHide={hideToast} />
      </View>
    </Modal>
  );
}

type RowProps = {
  item: Item;
  checked: boolean;
  onDone: (item: Item) => void;
  onToday: (item: Item) => void;
  onLetGo: (item: Item) => void;
};

function LeftoverRow({ item, checked, onDone, onToday, onLetGo }: RowProps) {
  return (
    <View style={styles.row}>
      <DayCheck text={item.text} date={item.date} checked={checked} onPress={() => onDone(item)} />
      <View style={styles.body}>
        <Txt style={[styles.text, checked && styles.textChecked]}>{item.text}</Txt>
        {checked ? (
          <Txt style={styles.didIt}>그날 했어요</Txt>
        ) : (
          <RowActions item={item} onToday={onToday} onLetGo={onLetGo} />
        )}
      </View>
    </View>
  );
}

// 글자를 키워 한 줄에 다 안 들어가면 버튼이 잘리지 않고 다음 줄로 내려간다
function RowActions({ item, onToday, onLetGo }: Pick<RowProps, 'item' | 'onToday' | 'onLetGo'>) {
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.text}, 이번 달로, 오늘 할 일로 옮기기`}
        style={dimPressed(styles.action)}
        onPress={() => onToday(item)}
      >
        <Txt variant="medium" style={styles.todayText}>
          이번 달로
        </Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.text}, 내려놓기`}
        accessibilityHint="지우지 않고 그날 장에 줄을 그어 남겨요"
        style={dimPressed(styles.action)}
        onPress={() => onLetGo(item)}
      >
        <Txt style={styles.letGoText}>내려놓기</Txt>
      </Pressable>
    </View>
  );
}

type ChronicRowProps = Omit<RowProps, 'item'> & {
  entry: ChronicItem;
  last: boolean;
  reason: DelayReason | undefined;
  onPick: (id: string, reason: DelayReason) => void;
};

// 오래 머문 일 한 줄: 이름 · 몇 달째 · 사유 칩 · 이번 달로/내려놓기
function ChronicRow({ entry, last, checked, reason, onPick, onDone, onToday, onLetGo }: ChronicRowProps) {
  const { item, months } = entry;
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <DayCheck text={item.text} date={item.date} checked={checked} onPress={() => onDone(item)} />
      <View style={[styles.body, styles.chronicBody]}>
        <View style={styles.chronicTitle}>
          <Txt variant="medium" style={[styles.chronicText, checked && styles.textChecked]}>
            {item.text}
          </Txt>
          <Txt variant="label" style={styles.since}>
            {chronicLabel(months)}
          </Txt>
        </View>
        {checked ? (
          <Txt style={styles.didIt}>그날 했어요</Txt>
        ) : (
          <>
            <View style={styles.chips} accessibilityLabel={`${item.text}, 왜 밀렸는지`}>
              {DELAY_REASONS.map((r) => (
                <Chip
                  key={r}
                  label={DELAY_REASON_LABELS[r]}
                  selected={reason === r}
                  accessibilityLabel={DELAY_REASON_LABELS[r]}
                  onPress={() => onPick(item.id, r)}
                />
              ))}
            </View>
            <RowActions item={item} onToday={onToday} onLetGo={onLetGo} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  sheet: { paddingHorizontal: SCREEN_X, paddingTop: 8, gap: 18 },
  // 아이패드·Mac: 폼 시트 안에서도 읽기 폭으로 가운데에 모은다
  sheetRoomy: { width: '100%', maxWidth: WIDE.readingWidth, alignSelf: 'center', paddingHorizontal: WIDE.pageX, paddingTop: 16 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: HIT },
  later: { minHeight: HIT, minWidth: HIT, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 16, color: colors.inkSoft },
  head: { gap: 6 },
  hint: { color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  loading: { marginTop: 24 },
  done: { textAlign: 'center', marginVertical: 32 },
  empty: { color: colors.muted, marginVertical: 16 },
  all: {
    alignSelf: 'flex-start',
    minHeight: SLIM_H,
    paddingHorizontal: 16,
    borderRadius: SLIM_H / 2,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allText: { color: colors.onDark, fontSize: 14 },
  group: { gap: 2 },
  date: { color: colors.inkSoft, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2, borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: colors.inkDash },
  body: { flex: 1, paddingTop: 10, paddingBottom: 2 },
  text: { fontSize: 16 },
  textChecked: { textDecorationLine: 'line-through', color: colors.muted },
  didIt: { paddingVertical: 12, fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginLeft: -10 },
  action: { minHeight: HIT, paddingHorizontal: 10, justifyContent: 'center' },
  todayText: { fontSize: 15, color: colors.navy },
  letGoText: { fontSize: 15, color: colors.inkSoft },
  chronic: { padding: 16, paddingBottom: 4, gap: 4, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft },
  chronicHead: { gap: 2, paddingBottom: 4 },
  chronicSub: { color: colors.inkSoft },
  chronicBody: { gap: 10, paddingBottom: 6 },
  chronicTitle: { gap: 2 },
  chronicText: { fontSize: 17, lineHeight: 25 },
  since: { color: colors.noteRed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }, // 칩 누르는 영역(44)이 위아래 줄과 겹치지 않게
  rowLast: { borderBottomWidth: 0 },
  freshHead: { color: colors.inkSoft, marginTop: 4 },
  review: { minHeight: 64, padding: 14, gap: 2, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.chipBorder, marginTop: 8 },
  reviewTitle: { color: colors.navy, fontSize: 16 },
  reviewSub: { color: colors.muted, fontSize: 13 },
});
