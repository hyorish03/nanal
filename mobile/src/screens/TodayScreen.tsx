import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Keyboard, LayoutAnimation, type ListRenderItem, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import type { Db } from '../db/types';
import {
  addItem,
  advanceStatus,
  completeOnItsDay,
  deleteItem,
  dropItem,
  type Item,
  type ItemKind,
  listItemsForDate,
  listMigrationCandidates,
  MAX_PRIORITY_PER_DAY,
  migrateAllToToday,
  migrateToDate,
  migrateToToday,
  moveItem,
  reopen,
  restoreItem,
  setPriority,
  undoDrop,
  undoMigration,
  updateItemText,
} from '../items/repo';
import { formatDayWithWeekday, formatLongDate, logicalDate } from '../lib/date';
import { moveIndex } from '../lib/position';
import { countRecordedDays } from '../stats/recordedDays';
import { userMessage } from '../lib/userError';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { useReduceMotion } from '../ui/useReduceMotion';
import { ItemRow } from './today/ItemRow';
import { openRow } from './today/swipe';
import { useDragReorder } from './today/useDragReorder';
import { MarginRule, NOTE_MARGIN, RuledFill, useRuleGap } from './today/NotebookPage';
import { Ribbon } from './today/Ribbon';
import type { LinkAction } from '../lib/deepLink';
import { OrganizeSheet } from './today/OrganizeSheet';
import { PostIt, POSTIT_SHOWN, type SettleHow } from './today/PostIt';
import { Composer } from './today/Composer';
import { PostponeSheet } from './today/PostponeSheet';
import { voiceAvailable } from '../voice/available';
import { dimPressed } from '../ui/press';
import { CHIP_H } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Toast, type ToastSpec } from '../ui/Toast';
import { useEvent } from '../ui/useEvent';
import { usePane } from '../ui/pane';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { useSpace } from '../ui/typeScale';
import { PANEL_W, TodayPanel } from './today/TodayPanel';
import { accountInitial, confirmDeleteAccount, confirmSignOut, useAccountEmail } from '../lib/account';
import { AccountSheet } from '../ui/AccountSheet';

// 개발용·출시 빌드에서만 말로 적기 시트를 불러온다(Expo Go에서는 네이티브 모듈이 없어 import 시 오류).
const VoiceSheet: typeof import('./today/VoiceSheet').VoiceSheet | null = voiceAvailable
  ? require('./today/VoiceSheet').VoiceSheet
  : null;

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void; onOpenArchive?: () => void; focusReady?: boolean; onFocused?: () => void; pendingAction?: LinkAction | null; onActionHandled?: () => void };

export function TodayScreen({ db, version, onChanged, onOpenEvening, onOpenArchive, focusReady = true, onFocused, pendingAction = null, onActionHandled }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [loaded, setLoaded] = useState(false); // 처음 목록을 불러왔다(넘어온 일 수를 알아야 포커스를 정한다)
  const [error, setError] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [organizeInput, setOrganizeInput] = useState<{ text: string; auto: boolean }>({ text: '', auto: false });
  const afterVoice = useRef<{ text: string; auto: boolean } | null>(null); // 말로 적기 시트가 내려간 뒤 열 정리 시트
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [postponing, setPostponing] = useState<{ id: string; prev: 'open' | 'doing' } | null>(null); // 언제로 미룰지 고르는 줄
  const email = useAccountEmail();
  const busy = useRef(false);
  const reorder = useRef(false); // 상태·중요를 바꿨거나 포스트잇을 정리했다: 다음에 불러온 목록을 넣을 때만 자리 이동을 애니메이션한다
  const reduce = useReduceMotion();
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Item>>(null);
  const pageRef = useRef<View>(null);
  const scrollY = useRef(new Animated.Value(0)).current; // 여백선이 목록 머리를 따라 움직이게
  const [headerH, setHeaderH] = useState(0);
  const [keyboardUp, setKeyboardUp] = useState(false); // 맺음말은 페이지 맨 아래 자리라 키보드를 따라 올라오지 않는다
  const [eveningW, setEveningW] = useState(0); // 책갈피 끈을 하루 마무리 버튼 왼쪽에 매달려고 잰다
  // 아이패드·Mac: 사이드바가 하루 마무리·지난 기록을 맡고, 공책은 읽기 좋은 폭으로 가운데에 모은다.
  // 창이 충분히 넓으면(wide) 넘어온 일·끝낸 일 수·기호 설명을 오른쪽 칸으로 뺀다.
  const pane = usePane();
  const layout = useLayoutClass();
  // 넓은 배치는 창 폭으로, 리본·하루 마무리 버튼은 사이드바가 안 보일 때(접었거나 휴대폰) 보인다
  const roomy = layout !== 'compact';
  const showNav = !pane.sidebar;
  const panel = roomy && layout === 'wide' && pane.width >= PANEL_MIN;
  const s = useSpace();
  const ruleGap = useRuleGap();

  // 표지가 다 펼쳐진 뒤에만 true가 된다(Main이 Cover의 onOpened로 알려 준다). 그래서 기다리지 않고 바로 포커스한다.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!focusReady || !loaded) return;
    // 넘어온 일이 많으면 키보드로 포스트잇을 가리지 않고 먼저 정리할 수 있게 둔다
    if (candidates.length <= POSTIT_SHOWN) inputRef.current?.focus();
    onFocused?.();
    // onFocused는 매 렌더 새 함수라, candidates는 처음 불러온 값만 보면 돼서 의존성에서 뺀다
  }, [focusReady, loaded]);

  const openOrganize = (input: { text: string; auto: boolean } = { text: '', auto: false }) => {
    setNotice(null);
    setOrganizeInput(input);
    setOrganizeOpen(true);
  };
  const openCapture = () => {
    if (VoiceSheet) {
      setNotice(null);
      setVoiceOpen(true);
    } else openOrganize();
  };

  // 위젯·컨트롤에서 온 동작. 표지가 다 펼쳐진 뒤에만 넘어온다(이미 펼쳐져 있으면 바로).
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction === 'focus') inputRef.current?.focus();
    else openCapture();
    onActionHandled?.();
    // onActionHandled는 매 렌더 새 함수라 의존성에서 뺀다
  }, [pendingAction]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listItemsForDate(db, today), listMigrationCandidates(db, today), countRecordedDays(db, today)])
      .then(([i, c, n]) => {
        if (cancelled) return;
        if (reorder.current) {
          reorder.current = false;
          // 줄이 순간이동하지 않고 새 자리로 미끄러진다. 동작 줄이기면 그냥 바뀐다
          if (!reduce) LayoutAnimation.configureNext(REORDER);
        }
        setItems(i);
        setCandidates(c);
        setRecordedDays(n);
        setLoaded(true);
        setError(null);
      })
      .catch((e) => {
        setError(userMessage(e, LOAD_FAILED));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  // 저장소 작업을 하나씩 실행하고, 실패하면 문구를 보여준다. 성공 여부를 돌려준다.
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
      setError(null);
      onChanged();
      return true;
    } catch (e) {
      setError(userMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  // 아래 함수들은 늘 같은 참조라 입력칸·목록 줄이 화면이 다시 그려질 때 따라 그려지지 않는다
  // 진동은 저장이 된 뒤 한 번(실패하면 문구만)
  const after = (feel: () => void) => (ok: boolean) => {
    if (ok) feel();
    return ok;
  };
  const submit = useEvent((kind: ItemKind, text: string) => run(() => addItem(db, { kind, text })).then(after(haptic.success)));
  // 실패하면 다음 불러오기(다른 이유로 일어날 수 있다)에 애니메이션이 묻어가지 않게 끈다
  const reordering = async (action: () => Promise<unknown>) => {
    reorder.current = true;
    const ok = await run(action);
    if (!ok) reorder.current = false;
    return ok;
  };
  const onAdvance = useEvent((id: string) => reordering(() => advanceStatus(db, id)).then(after(haptic.select)));
  const onTogglePriority = useEvent((id: string, on: boolean) => reordering(() => setPriority(db, id, on)).then(after(haptic.light)));
  const onEdit = useEvent((id: string, text: string) => run(() => updateItemText(db, id, text)));
  // 지우기는 묻지 않고 바로 지운 뒤, 잠깐 '되돌리기'를 띄운다
  const removeWithUndo = async (id: string) => {
    const ok = await reordering(() => deleteItem(db, id));
    if (ok) {
      haptic.warning();
      setToast({
        key: Date.now(),
        message: '지웠어요',
        action: { label: '되돌리기', onPress: () => void reordering(() => restoreItem(db, id)) },
      });
    }
    return ok;
  };
  const onDelete = useEvent((id: string) => removeWithUndo(id));
  // 미루기는 언제로 미룰지 먼저 묻는다(시트). 고르면 바로 옮긴 뒤 '되돌리기'를 띄운다. 되돌리면 미루기 전 상태(할 일·진행 중)로 돌아간다
  const onPostpone = useEvent((id: string) => {
    const prev = items.find((i) => i.id === id)?.status;
    if (prev !== 'open' && prev !== 'doing') return;
    Keyboard.dismiss();
    setPostponing({ id, prev });
  });
  const postponeTo = async (date: string) => {
    const target = postponing;
    setPostponing(null);
    if (!target) return;
    let createdId = '';
    const ok = await reordering(async () => {
      createdId = (await migrateToDate(db, target.id, date)).id;
    });
    if (ok && createdId) {
      haptic.light();
      setToast({
        key: Date.now(),
        message: `${formatDayWithWeekday(date)}로 미뤘어요`,
        action: { label: '되돌리기', onPress: () => void reordering(() => undoMigration(db, createdId, target.prev)) },
      });
    }
  };
  // 안 하기: 지우지 않고 줄을 긋는다. 바로 '되돌리기'를 띄우고, 나중에는 기호를 눌러 다시 할 일로 돌린다
  const onDrop = useEvent(async (id: string) => {
    let prev: 'open' | 'doing' = 'open';
    const ok = await reordering(async () => {
      prev = await dropItem(db, id);
    });
    if (ok) {
      haptic.light();
      setToast({
        key: Date.now(),
        message: '안 하기로 했어요',
        action: { label: '되돌리기', onPress: () => void reordering(() => undoDrop(db, id, prev)) },
      });
    }
  });
  // 형광펜 쪽으로 밀었는데 오늘 중요가 이미 다 찼다(진동은 줄이 준다)
  const onPriorityFull = useEvent(() => setToast({ key: Date.now(), message: `중요는 하루 ${MAX_PRIORITY_PER_DAY}개까지예요` }));
  // 제자리에서 고치는 줄이 줄어든 화면(키보드 위) 아래로 가리면, 그 줄이 목록 아래 끝에 오게 굴린다
  const onRevealEdit = useEvent((id: string, bottom: number) => {
    pageRef.current?.measureInWindow((_x, y, _w, h) => {
      if (bottom <= y + h - REVEAL_GAP) return;
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return;
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 1, viewOffset: -REVEAL_GAP, animated: !reduce });
      } catch {
        // 아직 재지 못한 줄이면 굴리지 않는다
      }
    });
  });
  const hideToast = useCallback((key: number) => setToast((t) => (t?.key === key ? null : t)), []);

  // ── 길게 눌러 끌어 순서 바꾸기(오늘 장의 모든 줄). 새 순서를 먼저 보여 주고 저장한다. 못 하면 다시 읽어 되돌린다 ──
  const [dragging, setDragging] = useState<string | null>(null);
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const commitMove = (id: string, from: number, to: number) => {
    setItems((prev) => (prev[from]?.id === id ? moveIndex(prev, from, to) : prev));
    void run(() => moveItem(db, id, to)).then((ok) => {
      if (!ok) onChanged();
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
  // 스크린 리더: 한 칸씩 옮기고 몇 번째가 됐는지 읽어 준다
  const onMove = useEvent((id: string, delta: -1 | 1) => {
    const from = items.findIndex((i) => i.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    commitMove(id, from, to);
    AccessibilityInfo.announceForAccessibility(`${to + 1}번째 줄로 옮겼어요`);
  });
  const onCapture = useEvent(() => openCapture());

  // 그날 했어요: 원래 날짜 장에 끝낸 일로 남긴다. 되돌리면 체크하기 전 상태(할 일·진행 중)로 포스트잇에 돌아온다
  const completeWithUndo = async (item: Item) => {
    let prev: 'open' | 'doing' = 'open';
    const ok = await reordering(async () => {
      prev = await completeOnItsDay(db, item.id);
    });
    if (ok) {
      setToast({
        key: Date.now(),
        message: `${formatDayWithWeekday(item.date)}에 한 일로 체크했어요`,
        action: { label: '되돌리기', onPress: () => void reordering(() => reopen(db, item.id, prev)) },
      });
    }
    return ok;
  };

  const settle = (item: Item, how: SettleHow) =>
    how === 'delete'
      ? removeWithUndo(item.id)
      : how === 'done'
        ? completeWithUndo(item)
        : reordering(() => migrateToToday(db, item.id));

  const settleAll = () => reordering(() => migrateAllToToday(db, candidates.map((c) => c.id)));

  const priorityCount = items.filter((i) => i.priority && (i.status === 'open' || i.status === 'doing')).length;
  const priorityFull = priorityCount >= MAX_PRIORITY_PER_DAY;
  // 다른 날로 옮긴 원래 줄과 안 하기로 한 일은 '할 일 N개 중 M개'에서 뺀다
  const tasks = items.filter((i) => i.kind === 'task' && i.status !== 'migrated' && i.status !== 'dropped');
  const doneCount = tasks.filter((i) => i.status === 'done').length;

  const count = items.length;
  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item, index }) => (
      <ItemRow
        id={item.id}
        kind={item.kind}
        text={item.text}
        status={item.status}
        priority={item.priority}
        priorityFull={priorityFull}
        onAdvance={onAdvance}
        onTogglePriority={onTogglePriority}
        onEdit={onEdit}
        onPostpone={onPostpone}
        onDrop={onDrop}
        onDelete={onDelete}
        onPriorityFull={onPriorityFull}
        onRevealEdit={onRevealEdit}
        reorder={drag.reorder}
        canMoveUp={index > 0}
        canMoveDown={index < count - 1}
        onMove={onMove}
      />
    ),
    [priorityFull, count, onAdvance, onTogglePriority, onEdit, onPostpone, onDrop, onDelete, onPriorityFull, onRevealEdit, drag.reorder, onMove],
  );

  // 포스트잇만 목록 머리에 둬서 후보가 많아도 함께 스크롤된다. 입력칸은 목록 위에 고정한다
  const listHeader =
    candidates.length > 0 && !panel ? (
      <View style={styles.listHeader} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
        <PostIt candidates={candidates} today={today} onSettle={settle} onSettleAll={settleAll} />
      </View>
    ) : null;
  // 목록이 고정된 입력칸 밑으로 지나가기 시작하면 경계에 옅은 그늘을 깐다
  const edgeShade = scrollY.interpolate({ inputRange: [0, 12], outputRange: [0, 1], extrapolate: 'clamp' });

  // 날짜 머리 + 공책 한 쪽. 휴대폰에서는 화면에 바로, 넓은 배치에서는 가운데 칸에 놓는다
  const notebook = (
    <>
      {/* 머리 빈 곳을 누르면 키보드가 내려간다. 알림 줄은 머리 아래 여백에 겹쳐 띄워 목록을 밀지 않는다.
          스크린 리더가 날짜 → 하루 마무리 → 지난 기록 순서로 읽도록 날짜를 먼저 그리고, 화면에서는 뒤집어 쌓아 버튼을 위에 둔다 */}
      <Pressable accessible={false} style={styles.header} onPress={Keyboard.dismiss}>
        <View style={styles.headerText}>
          <Txt
            variant="title"
            accessibilityRole="header"
            style={styles.date}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatLongDate(today)}
          </Txt>
          <Txt variant="hand">기록한 날 {recordedDays}일</Txt>
        </View>
        {showNav && (
          <View style={styles.headerActions}>
            {/* 왼쪽: 계정(이 노트의 주인·로그아웃). 오른쪽: 하루 마무리 */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="계정"
              accessibilityHint="이메일을 보고 로그아웃할 수 있어요"
              hitSlop={CHIP_SLOP}
              style={dimPressed(styles.account)}
              onPress={() => setAccountOpen(true)}
            >
              <Txt variant="medium" style={styles.accountText}>
                {accountInitial(email)}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              hitSlop={CHIP_SLOP}
              style={dimPressed(styles.evening)}
              onPress={onOpenEvening}
              onLayout={(e) => setEveningW(e.nativeEvent.layout.width)}
            >
              <Txt variant="medium" style={styles.eveningText}>
                하루 마무리
              </Txt>
            </Pressable>
          </View>
        )}
        {(error || notice) && (
          <Txt
            style={[styles.message, error ? styles.error : styles.notice]}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {error ?? notice}
          </Txt>
        )}
      </Pressable>
  
      {/* 지난 기록 책갈피 끈: 하루 마무리 버튼 왼쪽, 화면 맨 위에 매달린다 */}
      {showNav && onOpenArchive && eveningW > 0 && <Ribbon onPress={onOpenArchive} style={{ right: SCREEN_X + eveningW + RIBBON_GAP }} />}
  
      {/* 입력칸과 할 일·메모 칩은 고정. 그 아래 목록만 스크롤된다.
          칩과 목록 사이는 좁게 두고, 숨 쉴 자리는 목록 맨 위 여백(LIST_TOP)으로 넣어 스크롤하면 함께 올라가게 한다 */}
      <View style={styles.writing}>
        <Composer inputRef={inputRef} voice={VoiceSheet !== null} onCapture={onCapture} onSubmit={submit} />

        {/* 공책 한 쪽: 여백선은 목록 뒤에 깔리고, 빈 줄은 목록 꼬리에서 함께 스크롤된다 */}
        <View ref={pageRef} style={styles.page}>
          <MarginRule scrollY={scrollY} startY={listHeader ? LIST_TOP + headerH : 0} />
          <Animated.View pointerEvents="none" style={[styles.edge, { opacity: edgeShade }]} />
          {/* 끄는 줄의 칸을 맨 위에 그린다 */}
          <AnimatedList
            ref={listRef}
            style={styles.list}
            data={items}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.listContent}
            ListFooterComponentStyle={styles.footerWrap}
            ListHeaderComponent={listHeader}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
              listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => drag.onScroll(e.nativeEvent.contentOffset.y),
            })}
            scrollEventThrottle={16}
            onContentSizeChange={drag.onContentSize}
            scrollEnabled={dragging === null} // 끄는 동안 목록은 손가락을 따라 굴러가지 않는다(끝 가까이에서만 저절로)
            onScrollBeginDrag={openRow.closeAll} // 목록을 굴리면 밀어 연 줄을 닫는다
            ListEmptyComponent={
              // 빈 날은 첫 두 줄에 흐리게 적어 두고, 그 아래로 빈 줄이 이어진다. 스크린 리더는 한 번에 읽는다
              <View accessible accessibilityLabel={`${EMPTY_TITLE}. ${EMPTY_HINT}`}>
                <View style={[styles.emptyRow, { minHeight: ruleGap }]}>
                  <Txt style={styles.empty}>{EMPTY_TITLE}</Txt>
                </View>
                <View style={[styles.emptyRow, { minHeight: ruleGap }]}>
                  <Txt style={styles.emptyHint}>{EMPTY_HINT}</Txt>
                </View>
              </View>
            }
            ListFooterComponent={
              // 목록 아래 빈 곳까지 빈 줄로 채워, 누르면 키보드가 내려간다
              <Pressable accessible={false} style={styles.footerWrap} onPress={Keyboard.dismiss}>
                <RuledFill />
                <Txt variant="hand" style={[styles.footer, keyboardUp && styles.footerHidden]}>
                  오늘도 한 줄씩.
                </Txt>
              </Pressable>
            }
            extraData={priorityFull}
            renderItem={renderItem}
          />
        </View>
      </View>
    </>
  );

  // 밀어 연 줄 바깥 어디를 만져도 그 줄을 닫는다(줄 안의 만짐은 줄이 먼저 알려 둔다)
  return (
    <View style={[styles.container, roomy && styles.containerRoomy]} onTouchStart={openRow.touchOutside}>
      <Paper />
      {roomy ? (
        <View style={[styles.roomy, { paddingTop: s.xl, gap: WIDE.gutter }]}>
          <View style={[styles.column, { gap: s.xl }]}>{notebook}</View>
          {panel && (
            <TodayPanel candidates={candidates} today={today} onSettle={settle} onSettleAll={settleAll} done={doneCount} total={tasks.length} />
          )}
        </View>
      ) : (
        notebook
      )}
      <OrganizeSheet
        db={db}
        visible={organizeOpen}
        today={today}
        initialText={organizeInput.text}
        autoOrganize={organizeInput.auto}
        onClose={() => setOrganizeOpen(false)}
        onAdded={(message) => {
          setOrganizeOpen(false);
          setNotice(message ?? null);
          onChanged();
        }}
      />
      {VoiceSheet && (
        <VoiceSheet
          visible={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onTranscript={(spoken) => {
            afterVoice.current = { text: spoken, auto: true };
            setVoiceOpen(false);
          }}
          onTypeInstead={(spoken) => {
            afterVoice.current = { text: spoken, auto: false };
            setVoiceOpen(false);
          }}
          onDismissed={() => {
            const next = afterVoice.current;
            afterVoice.current = null;
            if (next) openOrganize(next);
          }}
        />
      )}
      <PostponeSheet visible={postponing !== null} today={today} onPick={(date) => void postponeTo(date)} onClose={() => setPostponing(null)} />
      <Toast toast={toast} onHide={hideToast} />
      <AccountSheet
        visible={accountOpen}
        email={email}
        onClose={() => setAccountOpen(false)}
        onSignOut={() => {
          setAccountOpen(false);
          void confirmSignOut(db);
        }}
        onDeleteAccount={() => {
          setAccountOpen(false);
          confirmDeleteAccount(db);
        }}
      />
    </View>
  );
}

// 머리 버튼도 칩처럼 보이는 높이만 낮추고, 누르는 영역은 hitSlop으로 44pt를 지킨다
const CHIP_SLOP = { top: 5, bottom: 5 };
const RIBBON_GAP = 16;
const REVEAL_GAP = 12; // 고치는 줄을 목록 아래 끝에서 이만큼 띄운다
// 오른쪽 칸을 둘 만한 폭: 바깥 여백 + 공책 최소 480 + 칸 사이 + 오른쪽 칸
const PANEL_MIN = WIDE.pageX * 2 + 480 + WIDE.gutter + PANEL_W;
const LOAD_FAILED = '오늘 기록을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요';
const EMPTY_TITLE = '아직 적은 줄이 없어요';
const EMPTY_HINT = '위 칸에 한 줄 적어 볼까요?';
// 목록은 gesture-handler의 FlatList: 줄 밀기(Pan)와 목록 스크롤이 서로 손가락을 빼앗지 않게 조율된다
const AnimatedList = Animated.createAnimatedComponent(FlatList<Item>);
const LIST_TOP = 14; // 목록 맨 위 여백(스크롤하면 함께 올라간다)
const REORDER = LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity); // 끈의 44pt 누르는 영역이 하루 마무리 버튼에 겹치지 않게

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 12, gap: 24 },
  containerRoomy: { paddingHorizontal: WIDE.pageX, paddingTop: 0 },
  // 공책 칸(읽기 폭까지)과 오른쪽 칸을 한 줄로 놓고 가운데에 모은다
  roomy: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  column: { flex: 1, maxWidth: WIDE.readingWidth },
  // 버튼은 맨 위 오른쪽 도구줄, 그 아래 날짜를 한 줄 전체 너비로(날짜를 먼저 그리므로 뒤집어 쌓는다)
  header: { flexDirection: 'column-reverse', gap: 10, zIndex: 1 },
  message: { position: 'absolute', top: '100%', left: 0, right: 0, fontSize: 13, lineHeight: 18 },
  headerText: { gap: 4 },
  date: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  account: {
    width: CHIP_H,
    height: CHIP_H,
    borderRadius: CHIP_H / 2,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: { fontSize: 14, color: colors.inkSoft },
  // 화면의 주 버튼 하나: 남색으로 채운다
  evening: {
    minHeight: CHIP_H,
    paddingHorizontal: 14,
    borderRadius: CHIP_H / 2,
    backgroundColor: colors.navy,
    justifyContent: 'center',
  },
  eveningText: { fontSize: 14, color: colors.onDark },
  notice: { color: colors.inkSoft },
  error: { color: colors.danger },
  writing: { flex: 1, gap: 6 },
  // 고정 영역 아래 경계: 목록이 밑으로 지나갈 때만 보이는 옅은 선과 그늘
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 1,
    backgroundColor: colors.lineSoft,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  page: { flex: 1, overflow: 'hidden' }, // 여백선이 머리 높이만큼 내려가도 화면 아래로 삐져나오지 않게
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingTop: LIST_TOP },
  // 할 일이 적으면 화면 맨 아래에 머물고, 목록이 길면 마지막 줄 아래로 밀려난다
  footerWrap: { flexGrow: 1, justifyContent: 'flex-end' },
  listHeader: { gap: 26, paddingBottom: 20 },
  // 여백선 오른쪽 글 자리에서 시작하는 한 줄(줄 높이와 같은 50pt)
  emptyRow: {
    justifyContent: 'center',
    paddingLeft: NOTE_MARGIN - SCREEN_X + 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ruled,
  },
  empty: { color: colors.muted },
  emptyHint: { color: colors.muted, fontSize: 14 },
  footerHidden: { opacity: 0 },
  footer: { alignSelf: 'center', marginTop: 24, marginBottom: 24, fontSize: 20, color: colors.muted },
});
