import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { dayTasksLine } from '../../archive/layout';
import type { DaySummary } from '../../archive/repo';
import { moodWord } from '../../days/moods';
import type { Item } from '../../items/repo';
import { formatLongDate } from '../../lib/date';
import type { Reflection } from '../../reflections/repo';
import { RuledPaper } from '../../ui/RuledPaper';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { symbolKind } from '../../ui/symbols';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { hasAnswer } from '../evening/draft';
import { ReflectionForm } from '../evening/ReflectionForm';
import { textBox } from './metrics';
import { TrashButton } from '../../ui/TrashButton';

const DAY_ITEMS_MAX = 10; // 날짜 상세에 보이는 할 일·메모 수(나머지는 "외 N개")
// 할 일 줄: 글은 16/24, 기호는 첫 줄 높이만 한 상자 가운데에 앉혀 여러 줄이어도 첫 줄에 맞춘다
const ITEM_LINE = 24;
const SYMBOL_COL = 22;
const SYMBOL = 16;
const CARD_RULE = 30;

export type Editing = { id: string; answers: Record<string, string> };

type Props = {
  date: string;
  day: DaySummary | undefined;
  future?: boolean; // 오늘 뒤의 날: 미뤄 둔 할 일만 보여 준다(기분·회고는 아직 없다)
  items: Item[];
  reflections: Reflection[];
  editing: Editing | null;
  actionError: string | null;
  large: boolean;
  keep: (field: View | null, button: View | null) => void;
  onEditChange: (key: string, value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (r: Reflection) => void;
  onDeleteReflection: (r: Reflection) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  divided?: boolean; // 달력 아래에 이어 붙을 때 위에 점선
};

function answersOf(r: Reflection): string[] {
  return r.questions.map((q) => r.answers[q.key]).filter((a): a is string => !!a);
}

// 고른 날의 기분, 할 일, 회고. 회고는 카드를 눌러 고치고, 휴지통으로 지운다.
export function DayDetail(p: Props) {
  const { day, editing, large, future = false } = p;
  const shown = p.items.slice(0, DAY_ITEMS_MAX);
  const hidden = p.items.length - shown.length;
  const rule = textBox(large ? 32 : CARD_RULE);
  const lineBox = textBox(ITEM_LINE);

  return (
    <View style={[styles.detail, large && styles.detailLarge, p.divided && styles.divided]} onLayout={p.onLayout}>
      <View style={styles.head}>
        <Txt variant="title" accessibilityRole="header" style={[styles.title, large && styles.titleLarge]}>
          {formatLongDate(p.date)}
        </Txt>
        {!future && (
          <Txt style={[styles.mood, large && styles.moodLarge]}>{day?.mood ? `기분 · ${moodWord(day.mood)}` : '기분 기록 없음'}</Txt>
        )}
      </View>
      <Txt style={[styles.sub, large && styles.subLarge]}>{dayTasksLine(day, future)}</Txt>
      {future && shown.length > 0 && (
        <Txt variant="hand" accessibilityRole="header" style={styles.planned}>
          이날 할 일
        </Txt>
      )}

      {shown.length > 0 && (
        <View style={styles.items}>
          {shown.map((it) => {
            const k = symbolKind(it);
            return (
              <View key={it.id} style={styles.itemRow}>
                <View style={[styles.symbol, { width: textBox(SYMBOL_COL), height: lineBox }]}>
                  <StatusSymbol kind={k} size={textBox(SYMBOL)} />
                </View>
                <Txt style={[styles.itemText, k === 'done' && styles.itemDone, k === 'migrated' && styles.itemMoved, k === 'dropped' && styles.itemDropped]}>
                  {it.text}
                </Txt>
              </View>
            );
          })}
          {hidden > 0 && <Txt style={[styles.muted, { paddingLeft: textBox(SYMBOL_COL) + 10 }]}>외 {hidden}개</Txt>}
        </View>
      )}

      <View style={styles.reflections}>
        {future && p.reflections.length === 0 ? null : p.reflections.length === 0 ? (
          <Txt style={styles.muted}>이 날은 회고가 없어요</Txt>
        ) : (
          p.reflections.map((r) =>
            editing?.id === r.id ? (
              <ReflectionForm
                key={r.id}
                title={r.templateName}
                questions={r.questions}
                values={editing.answers}
                onChange={p.onEditChange}
                submitLabel="고쳐 두기"
                canSubmit={hasAnswer(editing.answers)}
                onSubmit={p.onSaveEdit}
                onCancel={p.onCancelEdit}
                keep={p.keep}
                style={styles.card}
              />
            ) : (
              // 카드를 누르면 바로 고친다. 글은 줄마다 따로 읽히도록 카드는 접근성 요소로 묶지 않고, 제목을 고치기 버튼으로 읽힌다.
              <Pressable key={r.id} accessible={false} onPress={() => p.onStartEdit(r)}>
                <RuledPaper lineHeight={rule} style={[styles.card, large && styles.cardLarge]}>
                  <View style={[styles.cardHead, { height: rule }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`‘${r.templateName}’ 회고 고치기`}
                      style={styles.flexText}
                      onPress={() => p.onStartEdit(r)}
                    >
                      <Txt variant="hand" style={[styles.cardTitle, large && styles.cardTitleLarge]}>
                        {r.templateName}
                      </Txt>
                    </Pressable>
                    <TrashButton label={`‘${r.templateName}’ 회고 지우기`} height={rule} onPress={() => p.onDeleteReflection(r)} />
                  </View>
                  {answersOf(r).map((a, i) => (
                    <Txt key={i} style={[styles.cardLine, large && styles.cardLineLarge]}>
                      {a}
                    </Txt>
                  ))}
                </RuledPaper>
              </Pressable>
            ),
          )
        )}
      </View>
      {p.actionError && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {p.actionError}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { gap: 4 },
  detailLarge: { gap: 6 },
  divided: { paddingTop: 12, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  // 날짜와 기분은 글자 기준선에 맞춘다. 좁으면 기분이 다음 줄로 내려간다
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12 },
  title: { fontSize: 20, lineHeight: 28 },
  titleLarge: { fontSize: 26, lineHeight: 34 },
  mood: { fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  moodLarge: { fontSize: 15, lineHeight: 22 },
  sub: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 2, marginBottom: 10 },
  subLarge: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  items: { gap: 10, marginBottom: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  symbol: { alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 16, lineHeight: ITEM_LINE },
  itemDone: { textDecorationLine: 'line-through', color: colors.muted },
  itemMoved: { color: colors.muted },
  itemDropped: { textDecorationLine: 'line-through', color: colors.faint },
  planned: { marginBottom: 6 },
  reflections: { gap: 12 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  error: { color: colors.danger, fontSize: 14, marginTop: 8 },
  card: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4 },
  cardLarge: { paddingHorizontal: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 21, lineHeight: CARD_RULE },
  cardTitleLarge: { fontSize: 23, lineHeight: 32 },
  flexText: { flex: 1 },
  cardLine: { fontSize: 15, lineHeight: CARD_RULE },
  cardLineLarge: { fontSize: 16, lineHeight: 32 },
});
