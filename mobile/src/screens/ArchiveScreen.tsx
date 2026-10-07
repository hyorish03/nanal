import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { reflectionFilters } from '../archive/filters';
import { type DaySummary, listMonthSummary } from '../archive/repo';
import { moodWord } from '../days/moods';
import type { Db } from '../db/types';
import { monthGrid } from '../lib/calendar';
import { addMonths, formatLongDate, formatMonth, logicalDate, monthOf } from '../lib/date';
import { listReflectionHistory, listReflections, type Reflection, type ReflectionEntry } from '../reflections/repo';
import { Inkwell } from '../ui/Inkwell';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';

type Props = { db: Db; version: number; onClose: () => void };
type Tab = 'calendar' | 'collection';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function answersOf(r: Reflection): string[] {
  return r.questions.map((q) => r.answers[q.key]).filter((a): a is string => !!a);
}

export function ArchiveScreen({ db, version, onClose }: Props) {
  const today = logicalDate(new Date());
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [dayReflections, setDayReflections] = useState<Reflection[]>([]);
  const [history, setHistory] = useState<ReflectionEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMonthSummary(db, month)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, month, version]);

  useEffect(() => {
    let cancelled = false;
    listReflections(db, selected)
      .then((r) => !cancelled && setDayReflections(r))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, selected, version]);

  useEffect(() => {
    if (tab !== 'collection') return;
    let cancelled = false;
    listReflectionHistory(db)
      .then((h) => !cancelled && setHistory(h))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, tab, version]);

  const byDate = useMemo(() => new Map(summary.map((s) => [s.date, s])), [summary]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const day = byDate.get(selected);
  const filters = useMemo(() => reflectionFilters(history), [history]);
  const entries = filter ? history.filter((h) => h.template === filter) : history;
  const filterName = filters.find((f) => f.id === filter)?.name;
  const isCurrentMonth = month >= monthOf(today);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" style={styles.back} onPress={onClose}>
          <Txt style={styles.backText}>오늘로</Txt>
        </Pressable>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          지난 기록
        </Txt>
        <View style={styles.backSpacer} />
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {(
          [
            ['calendar', '달력'],
            ['collection', '회고 모아보기'],
          ] as const
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setTab(key)}
            >
              <Txt variant={on ? 'medium' : 'body'} style={[styles.tabText, !on && styles.tabTextOff]}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {error && <Txt style={styles.error}>{error}</Txt>}

      {tab === 'calendar' && (
        <>
          <View style={styles.monthRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" style={styles.arrow} onPress={() => setMonth(addMonths(month, -1))}>
              <Txt style={styles.arrowText}>‹</Txt>
            </Pressable>
            <Txt variant="title" style={styles.monthText}>
              {formatMonth(month)}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              accessibilityState={{ disabled: isCurrentMonth }}
              disabled={isCurrentMonth}
              style={styles.arrow}
              onPress={() => setMonth(addMonths(month, 1))}
            >
              <Txt style={[styles.arrowText, isCurrentMonth && styles.arrowOff]}>›</Txt>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((w) => (
              <Txt key={w} style={[styles.cell, styles.weekday]}>
                {w}
              </Txt>
            ))}
            {cells.map((date, i) => {
              if (!date) return <View key={`b${i}`} style={styles.cell} />;
              const s = byDate.get(date);
              const future = date > today;
              const on = date === selected;
              const word = moodWord(s?.mood ?? null);
              const d = Number(date.slice(8));
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${Number(date.slice(5, 7))}월 ${d}일${word ? `, 기분 ${word}` : ''}${s?.hasReflection ? ', 회고 있음' : ''}`}
                  accessibilityState={{ selected: on, disabled: future }}
                  disabled={future}
                  style={[styles.cell, styles.dayCell, on && styles.dayOn]}
                  onPress={() => setSelected(date)}
                >
                  <Txt
                    variant={date === today ? 'medium' : 'body'}
                    style={[styles.dayNum, date === today && styles.today, future && styles.future]}
                  >
                    {d}
                  </Txt>
                  {!future && (
                    <View style={{ opacity: s?.mood ? 1 : 0.35 }}>
                      <Inkwell id={`cal${date}`} mood={s?.mood ?? null} size="small" />
                    </View>
                  )}
                  <View style={[styles.dot, s?.hasReflection && styles.dotOn]} />
                </Pressable>
              );
            })}
          </View>
          <Txt style={styles.legend}>잉크가 찰수록 좋았던 날. 아래 점은 회고를 남긴 날이에요.</Txt>

          <View style={styles.detail}>
            <View style={styles.detailHead}>
              <Txt variant="title" style={styles.detailTitle}>
                {formatLongDate(selected)}
              </Txt>
              <Txt style={styles.small}>{day?.mood ? `기분 · ${moodWord(day.mood)}` : '기분 기록 없음'}</Txt>
            </View>
            <Txt style={styles.small}>
              {day ? `할 일 ${day.tasksTotal}개 중 ${day.tasksDone}개 끝냄` : '기록이 없는 날이에요'}
            </Txt>
            {dayReflections.length === 0 ? (
              <Txt style={styles.muted}>이 날은 회고를 남기지 않았어요. 괜찮아요.</Txt>
            ) : (
              dayReflections.map((r) => (
                <RuledPaper key={r.id} lineHeight={30} style={styles.card}>
                  <Txt variant="hand" style={styles.cardTitle}>
                    {r.templateName}
                  </Txt>
                  {answersOf(r).map((a, i) => (
                    <Txt key={i} style={styles.cardLine}>
                      {a}
                    </Txt>
                  ))}
                </RuledPaper>
              ))
            )}
          </View>
        </>
      )}

      {tab === 'collection' && (
        <>
          <View style={styles.filters}>
            {[{ id: null, name: '전체' }, ...filters].map((f) => {
              const on = filter === f.id;
              return (
                <Pressable
                  key={f.id ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.filter, on && styles.filterOn]}
                  onPress={() => setFilter(f.id)}
                >
                  <Txt style={styles.filterText}>{f.name}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt style={styles.small}>
            {filter ? `${filterName} ${entries.length}번` : history.length ? `회고 ${history.length}개` : '아직 남긴 회고가 없어요'}
          </Txt>
          {entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={styles.entryHead}>
                <Txt variant="hand" style={styles.entryTitle}>
                  {e.templateName}
                </Txt>
                <Txt style={styles.entryMeta}>
                  {formatLongDate(e.date)} · 기분 {moodWord(e.mood) ?? '-'}
                </Txt>
              </View>
              {answersOf(e).map((a, i) => (
                <Txt key={i} style={styles.entryLine}>
                  {a}
                </Txt>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: SCREEN_X - 2, paddingTop: 8, paddingBottom: 24, gap: 14 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  backText: { fontSize: 15 },
  backSpacer: { width: 48 },
  title: { fontSize: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.navy },
  tabText: { fontSize: 15 },
  tabTextOff: { color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18, color: colors.muted },
  arrowOff: { color: colors.lineSoft },
  monthText: { fontSize: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingBottom: 4 },
  dayCell: { minHeight: 52, paddingVertical: 4, borderRadius: 8, gap: 2 },
  dayOn: { backgroundColor: colors.chipSelected },
  dayNum: { fontSize: 13 },
  today: { color: colors.navy, textDecorationLine: 'underline' },
  future: { color: colors.line },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOn: { backgroundColor: colors.navy },
  legend: { fontSize: 12, color: colors.muted },
  detail: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  detailTitle: { fontSize: 20 },
  small: { fontSize: 13, color: colors.inkSoft },
  muted: { fontSize: 14, color: colors.muted },
  card: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4 },
  cardTitle: { fontSize: 21, lineHeight: 30 },
  cardLine: { fontSize: 14, lineHeight: 30 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: '#CFC3AE', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.highlight, borderColor: colors.ink },
  filterText: { fontSize: 13 },
  entry: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4, padding: 12, gap: 6 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryTitle: { fontSize: 20, flexShrink: 1 },
  entryMeta: { fontSize: 12, color: colors.muted },
  entryLine: { fontSize: 14, lineHeight: 22 },
});
