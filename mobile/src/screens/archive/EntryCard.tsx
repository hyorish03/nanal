import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ArchiveEntry } from '../../archive/repo';
import { moodWord } from '../../days/moods';
import { formatLongDate } from '../../lib/date';
import { dimPressed } from '../../ui/press';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

// 모아보기의 회고 한 장. 질문 아래에 답을 적고, 누르면 달력에서 그날을 연다.
export const EntryCard = memo(function EntryCard({ entry, large, onOpenDay }: { entry: ArchiveEntry; large: boolean; onOpenDay: (date: string) => void }) {
  const date = formatLongDate(entry.date);
  const mood = moodWord(entry.mood);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="달력에서 이 날을 열어요"
      style={dimPressed([styles.entry, large && styles.entryLarge])}
      onPress={() => onOpenDay(entry.date)}
    >
      <View style={styles.entryHead}>
        <Txt variant="hand" style={[styles.entryTitle, large && styles.entryTitleLarge]}>
          {entry.templateName}
        </Txt>
        <Txt style={[styles.entryMeta, large && styles.entryMetaLarge]}>
          {date} · 기분 {mood ?? '-'}
        </Txt>
      </View>
      {entry.answers.map((qa, i) => (
        <View key={i} style={styles.qa}>
          <Txt style={[styles.entryQuestion, large && styles.entryQuestionLarge]}>{qa.question}</Txt>
          <Txt style={[styles.entryLine, large && styles.entryLineLarge]}>{qa.answer}</Txt>
        </View>
      ))}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  entry: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4, padding: 12, gap: 8 },
  entryLarge: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  entryHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 8 },
  entryTitle: { fontSize: 20, flexShrink: 1 },
  entryTitleLarge: { fontSize: 23 },
  entryMeta: { fontSize: 12, color: colors.muted },
  entryMetaLarge: { fontSize: 13 },
  qa: { gap: 2 },
  entryQuestion: { fontSize: 13, lineHeight: 19, color: colors.muted },
  entryQuestionLarge: { fontSize: 14, lineHeight: 20 },
  entryLine: { fontSize: 14, lineHeight: 22 },
  entryLineLarge: { fontSize: 16, lineHeight: 26 },
});
