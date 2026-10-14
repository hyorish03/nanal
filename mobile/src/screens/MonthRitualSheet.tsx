import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { deleteItem, type Item, migrateAllToToday, migrateToToday, restoreItem, undoMigration } from '../items/repo';
import { formatLongDate, logicalDate, monthOf } from '../lib/date';
import { userMessage } from '../lib/userError';
import { monthLabel, reviewTargetMonth } from '../monthly/labels';
import { groupByDate, listMonthLeftovers } from '../monthly/ritual';
import { canOfferReview, loadReviewOffer, type ReviewOffer } from '../monthly/reviewOffer';
import { haptic } from '../ui/haptics';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { colors, HIT, SCREEN_X } from '../ui/theme';
import { Toast, type ToastSpec } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';

type Props = {
  db: Db;
  visible: boolean;
  onClose: () => void; // '나중에', 아래로 쓸어내리기, 다 정리한 뒤 저절로
  onChanged: () => void; // 옮기거나 지웠다(오늘 화면·위젯을 다시 그린다)
  onOpenReview: (month: string) => void;
};

const DONE_CLOSE_MS = 2200; // '새 달을 시작해요'를 읽을 틈(그사이 되돌리기를 누르면 닫지 않는다)
const SETTLE = LayoutAnimation.create(220, 'easeInEaseOut', 'opacity');

// 월초 정리(스펙 11.10). 새 달 첫 장에 지난달까지 끝내지 못한 일을 원래 날짜별로 모아 한 줄씩 정한다.
// 이번 달로(오늘 할 일로 옮긴다) · 지우기, 한꺼번에 이번 달로, 나중에(닫기만 한다. 오늘 포스트잇에 그대로 남는다).
// 누르기 전에는 아무것도 바꾸지 않는다.
export function MonthRitualSheet({ db, visible, onClose, onChanged, onOpenReview }: Props) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const roomy = useLayoutClass() !== 'compact';
  // 시트를 여는 순간의 논리 날짜로 고정한다(열어 둔 채 새벽 4시를 넘겨도 제목이 바뀌지 않게)
  const [today, setToday] = useState(() => logicalDate(new Date()));
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settledAny, setSettledAny] = useState(false); // 이 시트에서 하나라도 정리했다(다 비면 '새 달을 시작해요')
  const [offer, setOffer] = useState<ReviewOffer>({ hasReview: false, recordedDays: 0 });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const busy = useRef(false);
  const lastMonth = reviewTargetMonth(today);

  const load = useCallback(
    (animate: boolean) =>
      listMonthLeftovers(db, today).then((list) => {
        if (animate && !reduce) LayoutAnimation.configureNext(SETTLE);
        setItems(list);
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
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listMonthLeftovers(db, today)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
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

  const done = loaded && settledAny && items.length === 0 && !error;

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
      createdId = (await migrateToToday(db, item.id)).id;
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

  const remove = async (item: Item) => {
    const ok = await run(() => deleteItem(db, item.id));
    if (ok) {
      haptic.warning();
      setToast({ key: Date.now(), message: '지웠어요', action: { label: '되돌리기', onPress: () => void run(() => restoreItem(db, item.id)) } });
    }
  };

  const moveAll = () => run(() => migrateAllToToday(db, items.map((i) => i.id)));

  const hideToast = useCallback((key: number) => setToast((t) => (t?.key === key ? null : t)), []);

  const openReview = () => {
    onClose();
    onOpenReview(lastMonth);
  };

  const groups = groupByDate(items);
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
            {!done && items.length > 0 && (
              <Txt variant="small" style={styles.hint}>
                넘어온 일 {items.length}개. ‘이번 달로’는 오늘 할 일로 옮겨요
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
          ) : items.length === 0 ? (
            <Txt style={styles.empty}>정리할 일이 없어요</Txt>
          ) : (
            <>
              {items.length > 1 && (
                <Pressable accessibilityRole="button" style={dimPressed(styles.all)} onPress={moveAll}>
                  <Txt variant="medium" style={styles.allText}>
                    모두 이번 달로
                  </Txt>
                </Pressable>
              )}
              {groups.map((g) => (
                <View key={g.date} style={styles.group}>
                  <Txt variant="label" accessibilityRole="header" style={styles.date}>
                    {formatLongDate(g.date)}
                  </Txt>
                  {g.items.map((item) => (
                    <LeftoverRow key={item.id} item={item} onToday={moveToToday} onDelete={remove} />
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

function LeftoverRow({ item, onToday, onDelete }: { item: Item; onToday: (item: Item) => void; onDelete: (item: Item) => void }) {
  return (
    <View style={styles.row}>
      <Txt style={styles.text}>
        • {item.text}
      </Txt>
      {/* 글자를 키워 한 줄에 다 안 들어가면 버튼이 잘리지 않고 다음 줄로 내려간다 */}
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
          accessibilityLabel={`${item.text}, 지우기`}
          style={dimPressed(styles.action)}
          onPress={() => onDelete(item)}
        >
          <Txt style={styles.removeText}>지우기</Txt>
        </Pressable>
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
    minHeight: Math.max(HIT, 48),
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allText: { color: colors.onDark, fontSize: 15 },
  group: { gap: 2 },
  date: { color: colors.inkSoft, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  row: { paddingVertical: 6, borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: colors.inkDash },
  text: { fontSize: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginLeft: -10 },
  action: { minHeight: HIT, paddingHorizontal: 10, justifyContent: 'center' },
  todayText: { fontSize: 15, color: colors.navy },
  removeText: { fontSize: 15, color: colors.muted },
  review: { minHeight: 64, padding: 14, gap: 2, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.chipBorder, marginTop: 8 },
  reviewTitle: { color: colors.navy, fontSize: 16 },
  reviewSub: { color: colors.muted, fontSize: 13 },
});
