import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
import { ItemRow } from './today/ItemRow';
import { PostIt, type SettleHow } from './today/PostIt';
import { SymbolLegend } from './today/SymbolLegend';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void; onOpenArchive?: () => void; focusReady?: boolean };

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'note', symbol: '–', label: '메모' },
];

// 표지가 펼쳐지는 동안(약 950ms) 키보드가 올라오지 않도록 입력칸 포커스를 표지가 열린 뒤로 미룬다.
const FOCUS_DELAY_MS = 1000;

export function TodayScreen({ db, version, onChanged, onOpenEvening, onOpenArchive, focusReady = true }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const info = useAnchor();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!focusReady) return;
    const t = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(t);
  }, [focusReady]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listItemsForDate(db, today), listMigrationCandidates(db, today), countRecordedDays(db)])
      .then(([i, c, n]) => {
        if (cancelled) return;
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

  const submit = () =>
    run(async () => {
      await addItem(db, { kind, text });
      setText('');
    });

  const settle = (item: Item, how: SettleHow) =>
    run(() =>
      how === 'today' ? migrateToToday(db, item.id) : how === 'tomorrow' ? migrateToTomorrow(db, item.id) : deleteItem(db, item.id),
    );

  const priorityCount = items.filter((i) => i.priority && (i.status === 'open' || i.status === 'doing')).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="title" accessibilityRole="header" style={styles.date}>
            {formatLongDate(today)}
          </Txt>
          <Txt variant="hand">기록한 날 {recordedDays}일째</Txt>
        </View>
        <View style={styles.headerActions}>
          {onOpenArchive && (
            <Pressable accessibilityRole="button" accessibilityLabel="지난 기록" style={styles.iconButton} onPress={onOpenArchive}>
              <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
                <Path d="M3 2.5h9.5a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2v-11Z" stroke={colors.ink} strokeWidth={1.3} strokeLinejoin="round" />
                <Path d="M3 13.5a2 2 0 0 1 2-2h9.5M6.5 6h5M6.5 8.5h3.5" stroke={colors.ink} strokeWidth={1.3} strokeLinecap="round" />
              </Svg>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" style={styles.evening} onPress={onOpenEvening}>
            <Txt variant="medium" style={styles.eveningText}>
              저녁 마무리
            </Txt>
          </Pressable>
        </View>
      </View>

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
                style={[styles.kind, selected && styles.kindSelected]}
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
            style={styles.info}
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

      <Popover anchor={info.anchor} align="left" width={300} label="기호 설명" onClose={info.close}>
        <SymbolLegend kind={kind} onClose={info.close} />
      </Popover>

      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Txt style={styles.empty}>아직 적은 줄이 없어요</Txt>}
        ListFooterComponent={
          <Txt variant="hand" style={styles.footer}>
            오늘도 한 줄씩.
          </Txt>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 16, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flexShrink: 1, gap: 2 },
  date: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  kind: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  kindSelected: { backgroundColor: colors.chipSelected, borderColor: colors.ink },
  kindText: { fontSize: 14 },
  info: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 14 },
  list: { flex: 1 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  footer: { alignSelf: 'center', marginTop: 24, marginBottom: 24, fontSize: 20, color: colors.muted },
});
