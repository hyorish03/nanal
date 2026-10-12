import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, LayoutAnimation, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
    <View style={styles.listHeader}>
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
        <View style={styles.headerActions}>
          {onOpenArchive && (
            <Pressable accessibilityRole="button" accessibilityLabel="지난 기록" style={dimPressed(styles.archive)} onPress={onOpenArchive}>
              <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
                <Path d="M3 2.5h9.5a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2v-11Z" stroke={colors.ink} strokeWidth={1.3} strokeLinejoin="round" />
                <Path d="M3 13.5a2 2 0 0 1 2-2h9.5M6.5 6h5M6.5 8.5h3.5" stroke={colors.ink} strokeWidth={1.3} strokeLinecap="round" />
              </Svg>
              <Txt style={styles.archiveText}>기록</Txt>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" style={dimPressed(styles.evening)} onPress={onOpenEvening}>
            <Txt variant="medium" style={styles.eveningText}>
              저녁 마무리
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

      <Popover anchor={info.anchor} align="left" width={300} label="기호 설명" onClose={info.close}>
        <SymbolLegend kind={kind} onClose={info.close} />
      </Popover>

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.listContent}
        ListFooterComponentStyle={styles.footerWrap}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<Txt style={styles.empty}>아직 적은 줄이 없어요</Txt>}
        ListFooterComponent={
          // 목록 아래 빈 곳까지 채워, 누르면 키보드가 내려간다
          <Pressable accessible={false} style={styles.footerWrap} onPress={Keyboard.dismiss}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 16, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, zIndex: 1 },
  message: { position: 'absolute', top: '100%', left: 0, right: 0, fontSize: 13, lineHeight: 18 },
  headerText: { flex: 1, gap: 2 },
  date: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // 지난 기록: 책 그림만으로는 뜻이 약해 짧은 글을 곁들인다
  archive: {
    minHeight: 44,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  archiveText: { fontSize: 14 },
  evening: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.ink,
    justifyContent: 'center',
  },
  eveningText: { fontSize: 14 },
  inputBlock: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.ink, paddingBottom: 4 },
  input: { flex: 1, height: 44, paddingHorizontal: 6, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  kindSelected: { backgroundColor: colors.chipSelected, borderColor: colors.ink },
  kindText: { fontSize: 14 },
  organize: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { color: colors.inkSoft },
  info: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  footerWrap: { flexGrow: 1 },
  listHeader: { gap: 18, paddingBottom: 18 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  footer: { alignSelf: 'center', marginTop: 24, marginBottom: 24, fontSize: 20, color: colors.muted },
});
