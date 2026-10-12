import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { MOODS, moodWord } from '../days/moods';
import { getMood, setMood } from '../days/repo';
import type { Db } from '../db/types';
import { formatLongDate, logicalDate } from '../lib/date';
import { addReflection, listReflections, type Reflection } from '../reflections/repo';
import { deleteTemplate, listTemplates } from '../reflections/templateRepo';
import type { TemplateDef } from '../reflections/templates';
import { countRecordedDays } from '../stats/recordedDays';
import { eulReul } from '../lib/josa';
import { confirmDelete, showActionSheet } from '../ui/dialogs';
import { Inkwell } from '../ui/Inkwell';
import { EASE_OUT } from '../ui/motion';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, fonts, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { TemplateSheet } from './evening/TemplateSheet';
import { dimPressed } from '../ui/press';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

export function EveningScreen({ db, version, onChanged, onClose }: Props) {
  const today = logicalDate(new Date());
  const [mood, setMoodState] = useState<number | null>(null);
  const [moodPicked, setMoodPicked] = useState(false); // 이번에 직접 골랐다(불러온 값에는 깃펜을 내려 꽂지 않는다)
  const [saved, setSaved] = useState<Reflection[]>([]);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [template, setTemplate] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetEditing, setSheetEditing] = useState<TemplateDef | null>(null); // 닫히는 애니메이션 동안 내용을 유지하려고 visible과 분리
  const openSheet = (editing: TemplateDef | null) => {
    setSheetEditing(editing);
    setSheetVisible(true);
  };
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setTemplate(null);
    setAnswers({});
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMood(db, today), listReflections(db, today), listTemplates(db), countRecordedDays(db)])
      .then(([m, r, t, n]) => {
        if (cancelled) return;
        setMoodState(m);
        setSaved(r);
        setTemplates(t);
        setRecordedDays(n);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

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

  // 누르자마자 잉크병을 바꾸고 저장한다. 저장하지 못하면 되돌리고 오류 문구를 보여준다.
  const pickMood = async (value: number) => {
    if (busy.current) return;
    const prev = mood;
    const next = mood === value ? null : value;
    setMoodPicked(true);
    setMoodState(next);
    const ok = await run(() => setMood(db, today, next));
    if (!ok) setMoodState(prev);
  };

  const save = () =>
    run(async () => {
      if (!template) return;
      await addReflection(db, { templateId: template, answers: answers[template] ?? {} });
      setTemplate(null);
      setAnswers((prev) => ({ ...prev, [template]: {} }));
    });

  const askDelete = (t: TemplateDef) =>
    confirmDelete(`‘${t.name}’${eulReul(t.name)} 지울까요?`, '이 템플릿으로 쓴 회고는 그대로 남아요.', () => {
      // 시트를 먼저 닫아야 실패했을 때 오류 문구가 저녁 화면에 보인다
      setSheetVisible(false);
      run(async () => {
        await deleteTemplate(db, t.id);
        if (template === t.id) setTemplate(null);
      });
    });

  const templateActions = (t: TemplateDef) =>
    showActionSheet(`‘${t.name}’`, [
      { label: '수정하기', onPress: () => openSheet(t) },
      { label: '삭제하기', destructive: true, onPress: () => askDelete(t) },
    ]);

  const current = templates.find((t) => t.id === template);
  const hasCustom = templates.some((t) => !t.builtin);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Txt variant="title" accessibilityRole="header" style={styles.title}>
              오늘을 덮으며
            </Txt>
            <Txt style={styles.sub}>{formatLongDate(today)}</Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="하루 마무리 닫기" style={dimPressed(styles.close)} onPress={onClose}>
            <Txt style={styles.closeText}>닫기</Txt>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Txt variant="hand" accessibilityRole="header" style={styles.h2}>
            오늘 마음은 어땠나요?
          </Txt>
          <View style={styles.moods}>
            {MOODS.map((m) => {
              const selected = mood === m;
              return (
                <Pressable
                  key={m}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`기분 ${m}점, ${moodWord(m)}`}
                  accessibilityState={{ selected }}
                  style={dimPressed(styles.mood)}
                  onPress={() => pickMood(m)}
                >
                  <MoodWell selected={selected} animate={moodPicked}>
                    <Inkwell id={`well${m}`} mood={m} size="large" selected={selected} animate={moodPicked} />
                  </MoodWell>
                  <Txt
                    variant={selected ? 'medium' : 'body'}
                    style={[styles.moodWord, selected ? styles.moodWordOn : styles.moodWordOff]}
                  >
                    {moodWord(m)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="medium" style={styles.question}>
            오늘은 어떤 날이었나요? (건너뛰어도 괜찮아요)
          </Txt>
          <View style={styles.chips}>
            {templates.map((t) => {
              const selected = template === t.id;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityHint={t.builtin ? undefined : '길게 누르면 고치거나 지울 수 있어요'}
                  accessibilityActions={
                    t.builtin
                      ? undefined
                      : [
                          { name: 'edit', label: '수정하기' },
                          { name: 'delete', label: '삭제하기' },
                        ]
                  }
                  onAccessibilityAction={
                    t.builtin
                      ? undefined
                      : (e) => {
                          if (e.nativeEvent.actionName === 'edit') openSheet(t);
                          else if (e.nativeEvent.actionName === 'delete') askDelete(t);
                        }
                  }
                  style={dimPressed([styles.chip, selected && styles.chipOn])}
                  onPress={() => setTemplate(selected ? null : t.id)}
                  onLongPress={t.builtin ? undefined : () => templateActions(t)}
                >
                  <Txt variant={selected ? 'medium' : 'body'} style={styles.chipText}>
                    {t.name}
                  </Txt>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" style={dimPressed(styles.newChip)} onPress={() => openSheet(null)}>
              <Txt style={styles.newChipText}>+ 새 템플릿</Txt>
            </Pressable>
          </View>
          {hasCustom && <Txt style={styles.hint}>내가 만든 템플릿은 길게 눌러 고치거나 지울 수 있어요</Txt>}
        </View>

        {current && (
          <View>
            <View accessible={false} style={styles.tape} />
            <RuledPaper style={styles.form}>
              {current.questions.map((q) => (
                <View key={q.key}>
                  <Txt variant="hand" style={styles.formQ} accessible={false} importantForAccessibility="no">
                    {q.text}
                  </Txt>
                  <TextInput
                    style={styles.answer}
                    multiline
                    accessibilityLabel={q.text}
                    value={answers[current.id]?.[q.key] ?? ''}
                    onChangeText={(v) =>
                      setAnswers((prev) => ({ ...prev, [current.id]: { ...prev[current.id], [q.key]: v } }))
                    }
                  />
                </View>
              ))}
              <Pressable accessibilityRole="button" style={dimPressed(styles.save)} onPress={save}>
                <Txt variant="medium" style={styles.saveText}>
                  남겨두기
                </Txt>
              </Pressable>
            </RuledPaper>
          </View>
        )}

        {error && (
          <Txt style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        )}

        {saved.length > 0 && (
          <View style={styles.section}>
            <Txt variant="medium" style={styles.question}>
              오늘 남긴 회고
            </Txt>
            {saved.map((r) => (
              <RuledPaper key={r.id} style={styles.savedCard}>
                <Txt variant="hand" style={styles.formQ}>
                  {r.templateName}
                </Txt>
                {r.questions
                  .filter((q) => r.answers[q.key])
                  .map((q) => (
                    <Txt key={q.key} style={styles.savedAnswer} accessibilityLabel={`${q.text} ${r.answers[q.key]}`}>
                      {r.answers[q.key]}
                    </Txt>
                  ))}
              </RuledPaper>
            ))}
          </View>
        )}

        <View style={styles.stampBox}>
          <View accessible={false} style={styles.stamp}>
            <Txt variant="title" style={styles.stampText}>
              {recordedDays}일
            </Txt>
          </View>
          <Txt style={styles.stampCopy}>오늘도 한 장을 채웠어요. 내일 아침에 이어서 적어요.</Txt>
        </View>
      </ScrollView>

      <TemplateSheet
        db={db}
        visible={sheetVisible}
        editing={sheetEditing}
        onClose={() => setSheetVisible(false)}
        onSaved={(t) => {
          setSheetVisible(false);
          setTemplate(t.id);
          onChanged();
        }}
        onDelete={askDelete}
      />
    </View>
  );
}

const DIM = 0.55;

// 고른 잉크병만 진하게. 직접 골랐을 때만 짧게 밝아진다.
function MoodWell({ selected, animate, children }: { selected: boolean; animate: boolean; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(selected ? 1 : DIM)).current;
  useEffect(() => {
    if (!animate || !selected) {
      opacity.setValue(selected ? 1 : DIM);
      return;
    }
    const anim = Animated.timing(opacity, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [selected, animate, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paperEvening },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 16, paddingBottom: 24, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 28 },
  sub: { fontSize: 14, color: colors.muted },
  close: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  closeText: { fontSize: 15 },
  section: { gap: 10 },
  h2: { fontSize: 26 },
  moods: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { minWidth: 60, padding: 4, alignItems: 'center', gap: 6 },
  moodWord: { fontSize: 13, paddingBottom: 2, borderBottomWidth: 2 },
  moodWordOn: { borderBottomColor: colors.navy },
  moodWordOff: { color: colors.inkSoft, borderBottomColor: 'transparent' },
  question: { fontSize: 14, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CFC3AE',
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.highlight, borderColor: colors.ink },
  chipText: { fontSize: 14 },
  newChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.faint,
    justifyContent: 'center',
  },
  newChipText: { fontSize: 14, color: colors.inkSoft },
  hint: { fontSize: 12, color: colors.muted },
  tape: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 88,
    height: 22,
    zIndex: 1,
    backgroundColor: 'rgba(30, 47, 77, 0.22)',
    transform: [{ rotate: '-2deg' }],
  },
  form: { paddingTop: 22, paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  formQ: { fontSize: 23, lineHeight: 32 },
  answer: { minHeight: 64, fontSize: 15, lineHeight: 32, fontFamily: fonts.body, color: colors.ink, padding: 0, textAlignVertical: 'top' },
  save: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  saveText: { color: colors.card, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14 },
  savedCard: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint },
  savedAnswer: { fontSize: 14, lineHeight: 32 },
  stampBox: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: 10,
  },
  stamp: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  stampText: { fontSize: 13, color: colors.navy },
  stampCopy: { flex: 1, fontSize: 14, color: colors.inkSoft },
});
