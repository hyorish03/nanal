import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Db } from '../db/types';
import {
  addItem,
  deleteItem,
  dropItem,
  type Item,
  type ItemKind,
  listItemsForDate,
  listMigrationCandidates,
  migrateToToday,
  toggleDone,
} from '../items/repo';
import { logicalDate } from '../lib/date';
import { countRecordedDays } from '../stats/recordedDays';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void };

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'event', symbol: '○', label: '일정' },
  { kind: 'note', symbol: '–', label: '메모' },
];

function statusWord(item: Item): string {
  if (item.kind === 'event') return '일정';
  if (item.kind === 'note') return '메모';
  if (item.status === 'done') return '완료';
  if (item.status === 'migrated') return '옮김';
  if (item.status === 'dropped') return '버림';
  return '할 일(열림)';
}

function symbolOf(item: Item): string {
  if (item.kind === 'event') return '○';
  if (item.kind === 'note') return '–';
  if (item.status === 'done') return 'X';
  if (item.status === 'migrated') return '>';
  return '•';
}

export function TodayScreen({ db, version, onChanged, onOpenEvening }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [later, setLater] = useState<Set<string>>(new Set());
  const [recordedDays, setRecordedDays] = useState(0);
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => setLater(new Set()), [today]);

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

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  };

  const submit = () =>
    run(async () => {
      await addItem(db, { kind, text });
      setText('');
    });

  const visibleCandidates = candidates.filter((c) => !later.has(c.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.date} accessibilityRole="header">
            {today}
          </Text>
          <Text style={styles.sub}>기록한 날 {recordedDays}일</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.eveningButton} onPress={onOpenEvening}>
          <Text style={styles.eveningText}>저녁 마무리</Text>
        </Pressable>
      </View>

      {visibleCandidates.length > 0 && (
        <ScrollView style={styles.migration}>
          <Text style={styles.sectionTitle}>지난 할 일 {visibleCandidates.length}개</Text>
          {visibleCandidates.map((c) => (
            <View key={c.id} style={styles.candidate}>
              <Text style={styles.candidateText}>
                {c.text} <Text style={styles.sub}>({c.date})</Text>
              </Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.text} 오늘 하기`}
                  style={styles.actionButton}
                  onPress={() => run(() => migrateToToday(db, c.id))}
                >
                  <Text style={styles.action}>오늘 하기</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.text} 나중으로`}
                  style={styles.actionButton}
                  onPress={() => setLater(new Set(later).add(c.id))}
                >
                  <Text style={styles.action}>나중으로</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.text} 버리기`}
                  style={styles.actionButton}
                  onPress={() => run(() => dropItem(db, c.id))}
                >
                  <Text style={[styles.action, styles.danger]}>버리기</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k.kind}
            accessibilityRole="button"
            accessibilityLabel={k.label}
            accessibilityState={{ selected: kind === k.kind }}
            style={[styles.kind, kind === k.kind && styles.kindSelected]}
            onPress={() => setKind(k.kind)}
          >
            <Text style={[styles.kindText, kind === k.kind && styles.kindTextSelected]}>{k.symbol}</Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.input}
          autoFocus
          placeholder="한 줄로 기록"
          accessibilityLabel="새 항목"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
        />
      </View>

      {error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">{error}
        </Text>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Text style={styles.empty}>아직 기록이 없습니다</Text>}
        renderItem={({ item }) => {
          const toggleable = item.status === 'open' || item.status === 'done';
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                disabled={!toggleable}
                accessibilityRole={toggleable ? 'checkbox' : undefined}
                accessibilityLabel={`${statusWord(item)} ${item.text}`}
                accessibilityState={toggleable ? { checked: item.status === 'done' } : undefined}
                onPress={() => run(() => toggleDone(db, item.id))}
              >
                <Text style={styles.symbol} accessible={false} importantForAccessibility="no">{symbolOf(item)}</Text>
                <Text style={[styles.rowText, item.status === 'dropped' && styles.dropped]}>{item.text}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.text} 삭제`}
                style={styles.deleteButton}
                onPress={() => run(() => deleteItem(db, item.id))}
              >
                <Text style={styles.delete}>삭제</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#666', fontSize: 13 },
  eveningButton: { borderWidth: 1, borderColor: '#222', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  eveningText: { fontWeight: '600' },
  migration: { backgroundColor: '#f4f4f4', borderRadius: 8, padding: 12, maxHeight: 220, flexGrow: 0 },
  sectionTitle: { fontWeight: '700' },
  candidate: { gap: 4, marginTop: 8 },
  candidateText: { fontSize: 15 },
  actions: { flexDirection: 'row', gap: 16 },
  actionButton: { minHeight: 44, justifyContent: 'center' },
  action: { color: '#0a58ca', fontWeight: '600' },
  danger: { color: '#b00020' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  kindSelected: { backgroundColor: '#222', borderColor: '#222' },
  kindText: { fontSize: 18 },
  kindTextSelected: { color: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  error: { color: '#b00020' },
  empty: { color: '#767676', textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  rowMain: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  symbol: { width: 16, fontSize: 16, textAlign: 'center' },
  rowText: { fontSize: 16, flexShrink: 1 },
  dropped: { textDecorationLine: 'line-through', color: '#767676' },
  deleteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  delete: { color: '#767676' },
});
