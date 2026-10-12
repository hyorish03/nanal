import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, LayoutAnimation, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
  migrateToToday,
  migrateToTomorrow,
  setPriority,
} from '../items/repo';
import { formatLongDate, logicalDate } from '../lib/date';
import { countRecordedDays } from '../stats/recordedDays';
import { Popover, useAnchor } from '../ui/Popover';
import { colors, fonts, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';
import { ItemRow } from './today/ItemRow';
import { MarginRule, NOTE_MARGIN, RULE_GAP, RuledFill } from './today/NotebookPage';
import { Ribbon } from './today/Ribbon';
import type { LinkAction } from '../lib/deepLink';
import { OrganizeSheet } from './today/OrganizeSheet';
import { PostIt, type SettleHow } from './today/PostIt';
import { SymbolLegend } from './today/SymbolLegend';
import { voiceAvailable } from '../voice/available';
import { dimPressed } from '../ui/press';

// 개발용·출시 빌드에서만 말로 적기 시트를 불러온다(Expo Go에서는 네이티브 모듈이 없어 import 시 오류).
const VoiceSheet: typeof import('./today/VoiceSheet').VoiceSheet | null = voiceAvailable
  ? require('./today/VoiceSheet').VoiceSheet
  : null;

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void; onOpenArchive?: () => void; focusReady?: boolean; onFocused?: () => void; pendingAction?: LinkAction | null; onActionHandled?: () => void };

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'note', symbol: '–', label: '메모' },
];

export function TodayScreen({ db, version, onChanged, onOpenEvening, onOpenArchive, focusReady = true, onFocused, pendingAction = null, onActionHandled }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [organizeInput, setOrganizeInput] = useState<{ text: string; auto: boolean }>({ text: '', auto: false });
  const afterVoice = useRef<{ text: string; auto: boolean } | null>(null); // 말로 적기 시트가 내려간 뒤 열 정리 시트
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const settling = useRef(false); // 포스트잇 줄을 정리했다: 다음에 불러온 목록을 넣을 때만 자리 이동을 애니메이션한다
  const reduce = useReduceMotion();
  const info = useAnchor();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current; // 여백선이 목록 머리를 따라 움직이게
  const [headerH, setHeaderH] = useState(0);
  const [eveningW, setEveningW] = useState(0); // 책갈피 끈을 하루 마무리 버튼 왼쪽에 매달려고 잰다

  // 표지가 다 펼쳐진 뒤에만 true가 된다(Main이 Cover의 onOpened로 알려 준다). 그래서 기다리지 않고 바로 포커스한다.
  useEffect(() => {
    if (!focusReady) return;
    inputRef.current?.focus();
    onFocused?.();
    // onFocused는 매 렌더 새 함수라 의존성에서 뺀다
  }, [focusReady]);

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
        if (settling.current) {
          settling.current = false;
          if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        setItems(i);
        setCandidates(c);
        setRecordedDays(n);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  // 빈 칸에서 완료를 누르면 키보드만 내린다
  const submit = () => {
    if (!text.trim()) {
      Keyboard.dismiss();
      return;
    }
    return run(async () => {
      await addItem(db, { kind, text });
      setText('');
    });
  };

  const settle = async (item: Item, how: SettleHow) => {
    settling.current = true;
    const ok = await run(() =>
      how === 'today' ? migrateToToday(db, item.id) : how === 'tomorrow' ? migrateToTomorrow(db, item.id) : deleteItem(db, item.id),
    );
    if (!ok) settling.current = false;
    return ok;
  };

  const priorityCount = items.filter((i) => i.priority && (i.status === 'open' || i.status === 'doing')).length;

  // 포스트잇과 입력칸을 목록 머리로 둬서 후보가 많아도 함께 스크롤된다. 컴포넌트 타입이 아닌 엘리먼트라 입력칸이 다시 마운트되지 않는다.
  const listHeader = (
    <View style={styles.listHeader} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
      {candidates.length > 0 && <PostIt candidates={candidates} onSettle={settle} />}

      <View style={styles.inputBlock}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            ref={inputRef}
            placeholder="한 줄로 남기기"
            placeholderTextColor={colors.faint}
            accessibilityLabel="새 항목"
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            submitBehavior="submit"
            returnKeyType="done"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={VoiceSheet ? '말로 적기' : '정리해서 넣기'}
            accessibilityHint={VoiceSheet ? '말한 내용을 할 일과 메모로 정리해요' : '두서없이 쓴 글을 할 일과 메모로 정리해요'}
            style={dimPressed(styles.organize)}
            onPress={openCapture}
          >
            {VoiceSheet ? (
              <Svg width={22} height={22} viewBox="0 0 18 18" fill="none">
                <Rect x={6} y={1.5} width={6} height={10} rx={3} stroke={colors.inkSoft} strokeWidth={1.4} />
                <Path d="M3 8.5a6 6 0 0 0 12 0M9 14.5v2.5" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinecap="round" />
              </Svg>
            ) : (
              <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
                <Path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 0 1 3 3L8 15l-4 1Z" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinejoin="round" />
                <Path d="M12 5l3 3" stroke={colors.inkSoft} strokeWidth={1.4} />
              </Svg>
            )}
          </Pressable>
        </View>
        <View style={styles.kindRow}>
          {KINDS.map((k) => {
            const selected = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                accessibilityRole="button"
                accessibilityLabel={k.label}
                accessibilityState={{ selected }}
                hitSlop={CHIP_SLOP}
                style={dimPressed([styles.kind, selected && styles.kindSelected])}
                onPress={() => setKind(k.kind)}
              >
                <Txt style={styles.kindText}>
                  {k.symbol} {k.label}
                </Txt>
              </Pressable>
            );
          })}
          <Pressable
            ref={info.ref}
            accessibilityRole="button"
            accessibilityLabel="기호 설명"
            accessibilityState={{ expanded: info.anchor !== null }}
            style={dimPressed(styles.info)}
            onPress={info.open}
          >
            <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
              <Circle cx={10} cy={10} r={8.2} stroke={colors.muted} strokeWidth={1.3} />
              <Path d="M10 9v5" stroke={colors.muted} strokeWidth={1.4} strokeLinecap="round" />
              <Circle cx={10} cy={6.2} r={1.1} fill={colors.muted} />
            </Svg>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 머리 빈 곳을 누르면 키보드가 내려간다. 알림 줄은 머리 아래 여백에 겹쳐 띄워 목록을 밀지 않는다 */}
      <Pressable accessible={false} style={styles.header} onPress={Keyboard.dismiss}>
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
          <Txt variant="hand">기록한 날 {recordedDays}일째</Txt>
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

      <Popover anchor={info.anchor} align="left" width={300} label="기호 설명" onClose={info.close}>
        <SymbolLegend kind={kind} onClose={info.close} />
      </Popover>

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
            // 빈 날은 첫 줄에 흐리게 적어 두고, 그 아래로 빈 줄이 이어진다
            <View style={styles.emptyRow}>
              <Txt style={styles.empty}>아직 적은 줄이 없어요</Txt>
            </View>
          }
          ListFooterComponent={
            // 목록 아래 빈 곳까지 빈 줄로 채워, 누르면 키보드가 내려간다
            <Pressable accessible={false} style={styles.footerWrap} onPress={Keyboard.dismiss}>
              <RuledFill />
              <Txt variant="hand" style={styles.footer}>
                오늘도 한 줄씩.
              </Txt>
            </Pressable>
          }
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              priorityFull={priorityCount >= MAX_PRIORITY_PER_DAY}
              onAdvance={() => run(() => advanceStatus(db, item.id))}
              onTogglePriority={() => run(() => setPriority(db, item.id, !item.priority))}
              onDelete={() => run(() => deleteItem(db, item.id))}
            />
          )}
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
    </View>
  );
}

// 칩·머리 버튼은 보이는 높이만 낮추고, 누르는 영역은 hitSlop으로 44pt를 지킨다
const CHIP_H = 34;
const CHIP_SLOP = { top: 5, bottom: 5 };
const RIBBON_GAP = 16; // 끈의 44pt 누르는 영역이 하루 마무리 버튼에 겹치지 않게

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 12, gap: 24 },
  // 버튼은 맨 위 오른쪽 도구줄, 그 아래 날짜를 한 줄 전체 너비로
  header: { gap: 10, zIndex: 1 },
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
  inputBlock: { gap: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.ink, paddingBottom: 6 },
  input: { flex: 1, height: 44, paddingHorizontal: 6, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kind: { minHeight: CHIP_H, paddingHorizontal: 14, borderRadius: CHIP_H / 2, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  kindSelected: { backgroundColor: colors.chipSelected, borderColor: colors.ink },
  kindText: { fontSize: 14 },
  organize: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { color: colors.inkSoft },
  info: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
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
  footer: { alignSelf: 'center', marginTop: 24, marginBottom: 24, fontSize: 20, color: colors.muted },
});
