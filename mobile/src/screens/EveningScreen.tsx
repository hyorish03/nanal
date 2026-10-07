import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getMood, setMood } from '../days/repo';
import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { addReflection, listReflections, type Reflection } from '../reflections/repo';
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from '../reflections/templates';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

const MOODS = [1, 2, 3, 4, 5];

export function EveningScreen({ db, version, onChanged, onClose }: Props) {
  const today = logicalDate(new Date());
  const [mood, setMoodState] = useState<number | null>(null);
  const [saved, setSaved] = useState<Reflection[]>([]);
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<TemplateKey, Record<string, string>>>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setTemplate(null);
    setAnswers({});
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMood(db, today), listReflections(db, today)])
      .then(([m, r]) => {
        if (cancelled) return;
        setMoodState(m);
        setSaved(r);
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

  const pickMood = (value: number) => run(() => setMood(db, today, mood === value ? null : value));

  const save = () =>
    run(async () => {
      if (!template) return;
      await addReflection(db, { template, answers: answers[template] ?? {} });
      setTemplate(null);
      setAnswers((prev) => ({ ...prev, [template]: {} }));
    });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {today} 마무리
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="저녁 마무리 닫기"
            style={styles.closeButton}
            onPress={onClose}
          >
            <Text style={styles.link}>닫기</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>오늘 기분</Text>
        <View style={styles.moods}>
          {MOODS.map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`기분 ${m}점`}
              accessibilityState={{ selected: mood === m }}
              style={[styles.mood, mood === m && styles.moodSelected]}
              onPress={() => pickMood(m)}
            >
              <Text style={[styles.moodText, mood === m && styles.moodTextSelected]}>{m}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>오늘은 어떤 날이었나요? (선택)</Text>
        <View style={styles.templates}>
          {TEMPLATE_KEYS.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: template === key }}
              style={[styles.chip, template === key && styles.chipSelected]}
              onPress={() => {
                setTemplate(template === key ? null : key);
              }}
            >
              <Text style={template === key ? styles.chipTextSelected : undefined}>{TEMPLATES[key].label}</Text>
            </Pressable>
          ))}
        </View>

        {template && (
          <View style={styles.form}>
            {TEMPLATES[template].questions.map((q) => (
              <View key={q.key} style={styles.question}>
                <Text style={styles.questionText} accessible={false} importantForAccessibility="no">
                  {q.text}
                </Text>
                <TextInput
                  style={styles.answer}
                  multiline
                  accessibilityLabel={q.text}
                  value={answers[template]?.[q.key] ?? ''}
                  onChangeText={(v) =>
                    setAnswers((prev) => ({ ...prev, [template]: { ...prev[template], [q.key]: v } }))
                  }
                />
              </View>
            ))}
            <Pressable accessibilityRole="button" style={styles.save} onPress={save}>
              <Text style={styles.saveText}>저장</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {saved.length > 0 && (
          <View style={styles.saved}>
            <Text style={styles.sectionTitle}>오늘 남긴 회고</Text>
            {saved.map((r) => (
              <View key={r.id} style={styles.savedItem}>
                <Text style={styles.savedLabel}>{TEMPLATES[r.template].label}</Text>
                {TEMPLATES[r.template].questions
                  .filter((q) => r.answers[q.key])
                  .map((q) => (
                    <Text key={q.key}>
                      <Text style={styles.sub}>{q.text}{'\n'}</Text>
                      {r.answers[q.key]}
                    </Text>
                  ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  closeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#0a58ca', fontWeight: '600' },
  sectionTitle: { fontWeight: '700', marginTop: 8 },
  moods: { flexDirection: 'row', gap: 10 },
  mood: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  moodSelected: { backgroundColor: '#222', borderColor: '#222' },
  moodText: { fontSize: 18 },
  moodTextSelected: { color: '#fff' },
  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  chipSelected: { backgroundColor: '#222', borderColor: '#222' },
  chipTextSelected: { color: '#fff' },
  form: { gap: 12 },
  question: { gap: 6 },
  questionText: { fontSize: 15 },
  answer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, minHeight: 72, fontSize: 16, textAlignVertical: 'top' },
  save: { backgroundColor: '#222', borderRadius: 8, padding: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020' },
  saved: { gap: 8 },
  savedItem: { backgroundColor: '#f4f4f4', borderRadius: 8, padding: 12, gap: 6 },
  savedLabel: { fontWeight: '600' },
  sub: { color: '#555', fontSize: 13 },
});
