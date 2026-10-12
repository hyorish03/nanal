import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, LayoutAnimation, type ListRenderItem, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import type { Db } from '../db/types';
import {
  addItem,
  advanceStatus,
  deleteItem,
  type Item,
  type ItemKind,
  listItemsForDate,
  listMigrationCandidates,
  MAX_PRIORITY_PER_DAY,
  migrateAllToToday,
  migrateToToday,
  migrateToTomorrow,
  restoreItem,
  setPriority,
  updateItemText,
} from '../items/repo';
import { formatLongDate, logicalDate } from '../lib/date';
import { countRecordedDays } from '../stats/recordedDays';
import { userMessage } from '../lib/userError';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { useReduceMotion } from '../ui/useReduceMotion';
import { ItemRow } from './today/ItemRow';
import { MarginRule, NOTE_MARGIN, RULE_GAP, RuledFill } from './today/NotebookPage';
import { Ribbon } from './today/Ribbon';
import type { LinkAction } from '../lib/deepLink';
import { OrganizeSheet } from './today/OrganizeSheet';
import { PostIt, POSTIT_SHOWN, type SettleHow } from './today/PostIt';
import { Composer } from './today/Composer';
import { voiceAvailable } from '../voice/available';
import { dimPressed } from '../ui/press';
import { CHIP_H } from '../ui/Chip';
import { haptic } from '../ui/haptics';
import { Toast, type ToastSpec } from '../ui/Toast';
import { useEvent } from '../ui/useEvent';

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
  const busy = useRef(false);
  const reorder = useRef(false); // 상태·중요를 바꿨거나 포스트잇을 정리했다: 다음에 불러온 목록을 넣을 때만 자리 이동을 애니메이션한다
  const reduce = useReduceMotion();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current; // 여백선이 목록 머리를 따라 움직이게
  const [headerH, setHeaderH] = useState(0);
  const [keyboardUp, setKeyboardUp] = useState(false); // 맺음말은 페이지 맨 아래 자리라 키보드를 따라 올라오지 않는다
  const [eveningW, setEveningW] = useState(0); // 책갈피 끈을 하루 마무리 버튼 왼쪽에 매달려고 잰다

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
    Promise.all([listItemsForDate(db, today), listMigrationCandidates(db, today), countRecordedDays(db)])
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
  const hideToast = useCallback((key: number) => setToast((t) => (t?.key === key ? null : t)), []);
  const onCapture = useEvent(() => openCapture());

  const settle = (item: Item, how: SettleHow) =>
    how === 'delete'
      ? removeWithUndo(item.id)
      : reordering(() => (how === 'today' ? migrateToToday(db, item.id) : migrateToTomorrow(db, item.id)));

  const settleAll = () => reordering(() => migrateAllToToday(db, candidates.map((c) => c.id)));

  const priorityCount = items.filter((i) => i.priority && (i.status === 'open' || i.status === 'doing')).length;
  const priorityFull = priorityCount >= MAX_PRIORITY_PER_DAY;

  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) => (
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
        onDelete={onDelete}
      />
    ),
    [priorityFull, onAdvance, onTogglePriority, onEdit, onDelete],
  );

  // 포스트잇과 입력칸을 목록 머리로 둬서 후보가 많아도 함께 스크롤된다. 컴포넌트 타입이 아닌 엘리먼트라 입력칸이 다시 마운트되지 않는다.
  const listHeader = (
    <View style={styles.listHeader} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
      {candidates.length > 0 && <PostIt candidates={candidates} onSettle={settle} onSettleAll={settleAll} />}

      <Composer inputRef={inputRef} voice={VoiceSheet !== null} onCapture={onCapture} onSubmit={submit} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Paper />
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
        <View style={styles.headerActions}>
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
      {onOpenArchive && eveningW > 0 && <Ribbon onPress={onOpenArchive} style={{ right: SCREEN_X + eveningW + RIBBON_GAP }} />}

      {/* 공책 한 쪽: 여백선은 목록 뒤에 깔리고, 빈 줄은 목록 꼬리에서 함께 스크롤된다 */}
      <View style={styles.page}>
        <MarginRule scrollY={scrollY} startY={headerH} />
        <Animated.FlatList
          style={styles.list}
          data={items}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          ListFooterComponentStyle={styles.footerWrap}
          ListHeaderComponent={listHeader}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          ListEmptyComponent={
            // 빈 날은 첫 두 줄에 흐리게 적어 두고, 그 아래로 빈 줄이 이어진다. 스크린 리더는 한 번에 읽는다
            <View accessible accessibilityLabel={`${EMPTY_TITLE}. ${EMPTY_HINT}`}>
              <View style={styles.emptyRow}>
                <Txt style={styles.empty}>{EMPTY_TITLE}</Txt>
              </View>
              <View style={styles.emptyRow}>
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
      <Toast toast={toast} onHide={hideToast} />
    </View>
  );
}

// 머리 버튼도 칩처럼 보이는 높이만 낮추고, 누르는 영역은 hitSlop으로 44pt를 지킨다
const CHIP_SLOP = { top: 5, bottom: 5 };
const RIBBON_GAP = 16;
const LOAD_FAILED = '오늘 기록을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요';
const EMPTY_TITLE = '아직 적은 줄이 없어요';
const EMPTY_HINT = '위 칸에 한 줄 적어 볼까요?';
const REORDER = LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity); // 끈의 44pt 누르는 영역이 하루 마무리 버튼에 겹치지 않게

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 12, gap: 24 },
  // 버튼은 맨 위 오른쪽 도구줄, 그 아래 날짜를 한 줄 전체 너비로(날짜를 먼저 그리므로 뒤집어 쌓는다)
  header: { flexDirection: 'column-reverse', gap: 10, zIndex: 1 },
  message: { position: 'absolute', top: '100%', left: 0, right: 0, fontSize: 13, lineHeight: 18 },
  headerText: { gap: 4 },
  date: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-end' },
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
  page: { flex: 1, overflow: 'hidden' }, // 여백선이 머리 높이만큼 내려가도 화면 아래로 삐져나오지 않게
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  // 할 일이 적으면 화면 맨 아래에 머물고, 목록이 길면 마지막 줄 아래로 밀려난다
  footerWrap: { flexGrow: 1, justifyContent: 'flex-end' },
  listHeader: { gap: 26, paddingBottom: 20 },
  // 여백선 오른쪽 글 자리에서 시작하는 한 줄(줄 높이와 같은 50pt)
  emptyRow: {
    minHeight: RULE_GAP,
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
