import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, LayoutAnimation, type ListRenderItem, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import type { Db } from '../../db/types';
import { moveIndex } from '../../lib/position';
import { userMessage } from '../../lib/userError';
import {
  addSomeday,
  advanceSomeday,
  deleteSomeday,
  dropSomeday,
  listSomeday,
  moveSomeday,
  moveSomedayToToday,
  restoreSomeday,
  type Someday,
  setSomedayPriority,
  sortSomeday,
  undoDropSomeday,
  undoMoveSomeday,
  updateSomedayText,
} from '../../someday/repo';
import { haptic } from '../../ui/haptics';
import { colors } from '../../ui/theme';
import { Toast, type ToastSpec } from '../../ui/Toast';
import { Txt } from '../../ui/Txt';
import { useEvent } from '../../ui/useEvent';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { Composer } from '../today/Composer';
import { ItemRow } from '../today/ItemRow';
import { RuledFill, useRuleGap } from '../today/NotebookPage';
import { openRow } from '../today/swipe';
import { useDragReorder } from '../today/useDragReorder';

type Props = {
  db: Db;
  version: string; // 바뀌면 다시 읽는다(동기화로 받은 변경 등)
  head: ReactNode; // 휴대폰에서는 지난 기록 머리(탭)를 목록과 함께 스크롤한다. 넓은 화면은 화면이 위에 고정한다
  contentStyle: StyleProp<ViewStyle>;
  onChanged?: () => void; // 오늘 할 일로 옮기면 오늘 장도 다시 읽어야 한다
};

// 지난 기록의 세 번째 탭 '언젠가': 날짜 없이 언젠가 할 일 한 목록. 오늘 장의 줄(ItemRow)을 그대로 쓴다.
// 형광펜은 개수 제한이 없다(매일 고르는 목록이 아니라서). 오늘 할 일로 옮긴 줄은 › 옮긴 일로 흐리게 남는다.
export function SomedayList({ db, version, head, contentStyle, onChanged }: Props) {
  const [rows, setRows] = useState<Someday[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const busy = useRef(false);
  const reorder = useRef(false); // 끝낸 줄이 아래로 가는 등 자리가 바뀔 수 있는 일을 했다
  const reduce = useReduceMotion();
  const listRef = useRef<FlatList<Someday>>(null);
  const pageRef = useRef<View>(null);
  const ruleGap = useRuleGap();

  useEffect(() => {
    let cancelled = false;
    listSomeday(db)
      .then((r) => {
        if (cancelled) return;
        if (reorder.current) {
          reorder.current = false;
          if (!reduce) LayoutAnimation.configureNext(REORDER);
        }
        setRows(r);
        setLoaded(true);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(userMessage(e, LOAD_FAILED));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db, version, tick]);

  const sorted = useMemo(() => sortSomeday(rows), [rows]);
  const doneCount = rows.filter((r) => r.status === 'done').length;

  // 저장소 작업을 하나씩. 끝나면 이 목록을 다시 읽고 다른 화면(오늘 장·위젯)에도 알린다
  const run = async (action: () => Promise<unknown>, moves = false): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    if (moves) reorder.current = true;
    try {
      await action();
      setError(null);
      setTick((t) => t + 1);
      onChanged?.();
      return true;
    } catch (e) {
      reorder.current = false;
      setError(userMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };
  const withUndo = (message: string, undo: () => Promise<unknown>) =>
    setToast({ key: Date.now(), message, action: { label: '되돌리기', onPress: () => void run(undo, true) } });

  const submit = useEvent(async (_kind: unknown, text: string) => {
    const ok = await run(() => addSomeday(db, text));
    if (ok) haptic.success();
    return ok;
  });
  const onAdvance = useEvent((id: string) => run(() => advanceSomeday(db, id), true).then((ok) => ok && haptic.select()));
  const onTogglePriority = useEvent((id: string, on: boolean) => run(() => setSomedayPriority(db, id, on)).then((ok) => ok && haptic.light()));
  const onEdit = useEvent((id: string, text: string) => run(() => updateSomedayText(db, id, text)));
  // 오늘 할 일로: 묻지 않고 옮긴 뒤 '되돌리기'를 띄운다
  const onMoveToday = useEvent(async (id: string) => {
    if (await run(() => moveSomedayToToday(db, id), true)) {
      haptic.light();
      withUndo('오늘 할 일로 옮겼어요', () => undoMoveSomeday(db, id));
    }
  });
  const onDrop = useEvent(async (id: string) => {
    if (await run(() => dropSomeday(db, id), true)) {
      haptic.light();
      withUndo('안 하기로 했어요', () => undoDropSomeday(db, id));
    }
  });
  const onDelete = useEvent(async (id: string) => {
    if (await run(() => deleteSomeday(db, id), true)) {
      haptic.warning();
      withUndo('지웠어요', () => restoreSomeday(db, id));
    }
  });
  const noop = useCallback(() => {}, []);
  // 제자리에서 고치는 줄이 키보드에 가리면 그 줄이 목록 아래 끝에 오게 굴린다(오늘 장과 같다)
  const onRevealEdit = useEvent((id: string, bottom: number) => {
    pageRef.current?.measureInWindow((_x, y, _w, h) => {
      if (bottom <= y + h - REVEAL_GAP) return;
      const index = sorted.findIndex((r) => r.id === id);
      if (index < 0) return;
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 1, viewOffset: -REVEAL_GAP, animated: !reduce });
      } catch {
        // 아직 재지 못한 줄이면 굴리지 않는다
      }
    });
  });
  const hideToast = useCallback((key: number) => setToast((t) => (t?.key === key ? null : t)), []);

  // ── 길게 눌러 끌어 순서 바꾸기. 끝낸 줄은 아래에 따로 모이므로 끌 수 없고, 끝내지 않은 줄(위쪽 묶음) 사이에서만 ──
  const [dragging, setDragging] = useState<string | null>(null);
  const ids = useMemo(() => sorted.filter((r) => r.status !== 'done').map((r) => r.id), [sorted]);
  const commitMove = (id: string, from: number, to: number) => {
    setRows((prev) => {
      const open = sortSomeday(prev).filter((r) => r.status !== 'done');
      if (open[from]?.id !== id) return prev;
      return [...moveIndex(open, from, to), ...prev.filter((r) => r.status === 'done')];
    });
    // 못 하면 다시 읽어 되돌린다
    void run(() => moveSomeday(db, id, to)).then((ok) => {
      if (!ok) setTick((t) => t + 1);
    });
  };
  const drag = useDragReorder({
    ids,
    reduce,
    scrollTo: (offset) => listRef.current?.scrollToOffset({ offset, animated: false }),
    measureViewport: (done) => pageRef.current?.measureInWindow((_x, y, _w, h) => done(y, h)),
    onActive: setDragging,
    onDrop: commitMove,
  });
  const onMove = useEvent((id: string, delta: -1 | 1) => {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    commitMove(id, from, to);
    AccessibilityInfo.announceForAccessibility(`${to + 1}번째 줄로 옮겼어요`);
  });
  const openCount = ids.length;

  const renderItem = useCallback<ListRenderItem<Someday>>(
    ({ item, index }) => (
      <ItemRow
        place="someday"
        id={item.id}
        kind="task"
        text={item.text}
        status={item.status}
        priority={item.priority}
        priorityFull={false}
        onAdvance={onAdvance}
        onTogglePriority={onTogglePriority}
        onEdit={onEdit}
        onPostpone={onMoveToday}
        onDrop={onDrop}
        onDelete={onDelete}
        onPriorityFull={noop}
        onRevealEdit={onRevealEdit}
        reorder={drag.reorder}
        draggable={item.status !== 'done'}
        canMoveUp={item.status !== 'done' && index > 0}
        canMoveDown={item.status !== 'done' && index < openCount - 1}
        onMove={onMove}
      />
    ),
    [onAdvance, onTogglePriority, onEdit, onMoveToday, onDrop, onDelete, noop, onRevealEdit, drag.reorder, openCount, onMove],
  );

  const header = (
    <View style={styles.head}>
      {head}
      <View style={styles.titleBlock}>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          언젠가
        </Txt>
        <Txt variant="hand" style={styles.subtitle}>
          날짜 없이 언젠가 할 일
        </Txt>
        {rows.length > 0 && (
          <Txt style={styles.count}>
            {rows.length}줄{doneCount > 0 ? ` · ${doneCount}개 끝냄` : ''}
          </Txt>
        )}
      </View>
      <Composer taskOnly={COMPOSER} onSubmit={submit} />
      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}
    </View>
  );

  return (
    // 밀어 연 줄 바깥 어디를 만져도 그 줄을 닫는다
    <View ref={pageRef} style={styles.flex} onTouchStart={openRow.touchOutside}>
      <FlatList
        ref={listRef}
        style={styles.flex}
        data={sorted}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, contentStyle]}
        onScrollBeginDrag={openRow.closeAll}
        onScroll={(e) => drag.onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        onContentSizeChange={drag.onContentSize}
        scrollEnabled={dragging === null}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loaded ? (
            // 빈 목록은 첫 줄에 손글씨로 흐리게 적어 둔다
            <View accessible accessibilityLabel={EMPTY} style={[styles.emptyRow, { minHeight: ruleGap }]}>
              <Txt variant="hand" style={styles.empty}>
                {EMPTY}
              </Txt>
            </View>
          ) : null
        }
        ListFooterComponentStyle={styles.footerWrap}
        ListFooterComponent={
          // 목록 아래 빈 곳까지 빈 줄로 채워, 누르면 키보드가 내려간다
          <Pressable accessible={false} style={styles.footer} onPress={Keyboard.dismiss}>
            <RuledFill />
          </Pressable>
        }
        renderItem={renderItem}
      />
      <Toast toast={toast} onHide={hideToast} />
    </View>
  );
}

const COMPOSER = { placeholder: '한 줄 더하기', label: '언젠가 할 일 더하기' };
const EMPTY = '생각나면 적어 두세요. 매일 고르라고 하지 않아요';
const LOAD_FAILED = '언젠가 목록을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요';
const REVEAL_GAP = 12;
const REORDER = LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  head: { gap: 14, paddingBottom: 14 },
  titleBlock: { gap: 2 },
  title: { fontSize: 26, letterSpacing: -0.4 },
  subtitle: { color: colors.inkSoft },
  count: { fontSize: 13, color: colors.muted, marginTop: 4 },
  error: { color: colors.danger, fontSize: 14 },
  emptyRow: { justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ruled },
  empty: { color: colors.muted },
  footerWrap: { flexGrow: 1 },
  footer: { flexGrow: 1, minHeight: 120 },
});
