import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Db } from '../../db/types';
import { createTemplate, MAX_TEMPLATE_NAME, MAX_TEMPLATE_QUESTION, updateTemplate } from '../../reflections/templateRepo';
import { MAX_TEMPLATE_QUESTIONS, type TemplateDef } from '../../reflections/templates';
import { userMessage } from '../../lib/userError';
import { useKeyboardResizePaused } from '../../ui/KeyboardResize';
import { RuledPaper } from '../../ui/RuledPaper';
import { colors, fonts, HIT } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { Paper } from '../../ui/Paper';
import { dimPressed } from '../../ui/press';
import { macText } from '../../ui/desktop';

type Props = {
  db: Db;
  visible: boolean;
  editing: TemplateDef | null; // null이면 새 템플릿
  onClose: () => void;
  onSaved: (template: TemplateDef) => void;
  onDelete: (template: TemplateDef) => void;
};

const PLACEHOLDERS = ['예: 오늘 어떤 운동을 했나요?', '예: 몸과 마음은 어땠나요?', ''];

export function TemplateSheet({ db, visible, editing, onClose, onSaved, onDelete }: Props) {
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useKeyboardResizePaused(visible);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setQuestions(editing ? editing.questions.map((q) => q.text) : ['']);
    setError(null);
  }, [visible, editing]);

  const filled = questions.map((q) => q.trim()).filter(Boolean);
  const valid = name.trim().length > 0 && filled.length > 0;
  const original = editing ? [editing.name, ...editing.questions.map((q) => q.text)] : [''];
  const dirty = [name, ...filled].map((s) => s.trim()).join('\n') !== original.map((s) => s.trim()).filter(Boolean).join('\n');

  // 쓰던 내용이 있으면 취소·아래로 쓸어내리기 전에 한 번 묻는다
  const requestClose = () => {
    if (!dirty || saving) {
      onClose();
      return;
    }
    Alert.alert('작성 중인 템플릿을 버릴까요?', undefined, [
      { text: '계속 쓰기', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onClose },
    ]);
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const input = { name, questions };
      if (editing) {
        await updateTemplate(db, editing.id, input);
        onSaved({ ...editing, name: name.trim(), questions: filled.map((text, i) => ({ key: `q${i + 1}`, text })) });
      } else {
        onSaved(await createTemplate(db, input));
      }
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Paper />
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable accessibilityRole="button" style={dimPressed(styles.headerButton)} onPress={requestClose}>
              <Txt style={styles.headerText}>취소</Txt>
            </Pressable>
            <Txt variant="medium" accessibilityRole="header">
              {editing ? '템플릿 고치기' : '새 템플릿'}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving }}
              disabled={!valid || saving}
              style={dimPressed(styles.headerButton)}
              onPress={save}
            >
              <Txt variant="medium" style={[styles.headerText, { color: valid ? colors.navy : colors.faint }]}>
                저장
              </Txt>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>이름</Txt>
            <TextInput
              style={macText(styles.name)}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              placeholder="예: 운동한 날"
              placeholderTextColor={colors.muted}
              accessibilityLabel="템플릿 이름"
              maxLength={MAX_TEMPLATE_NAME}
              textContentType="none"
              autoComplete="off"
            />
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>질문 (최대 {MAX_TEMPLATE_QUESTIONS}개)</Txt>
            {questions.map((q, i) => (
              <View key={i} style={styles.question}>
                <Txt style={styles.no}>{i + 1}</Txt>
                <TextInput
                  style={macText(styles.questionInput)}
                  value={q}
                  onChangeText={(v) => {
                    setQuestions(questions.map((x, j) => (j === i ? v : x)));
                    setError(null);
                  }}
                  placeholder={PLACEHOLDERS[i]}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={`질문 ${i + 1}`}
                  maxLength={MAX_TEMPLATE_QUESTION}
                />
                {questions.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`질문 ${i + 1} 지우기`}
                    style={dimPressed(styles.removeQ)}
                    onPress={() => setQuestions(questions.filter((_, j) => j !== i))}
                  >
                    <Txt style={styles.removeText}>×</Txt>
                  </Pressable>
                )}
              </View>
            ))}
            {questions.length < MAX_TEMPLATE_QUESTIONS && (
              <Pressable accessibilityRole="button" style={dimPressed(styles.add)} onPress={() => setQuestions([...questions, ''])}>
                <Txt style={styles.addText}>+ 질문 추가</Txt>
              </Pressable>
            )}
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>미리보기</Txt>
            <RuledPaper style={styles.preview}>
              <Txt variant="hand" style={styles.previewName}>
                {name.trim() || '템플릿 이름'}
              </Txt>
              {(filled.length ? filled : ['질문을 적으면 여기에 보여요']).map((q, i) => (
                <Txt key={i} style={styles.previewQ}>
                  {q}
                </Txt>
              ))}
            </RuledPaper>
          </View>

          {error && (
            <Txt style={styles.error} accessibilityRole="alert">
              {error}
            </Txt>
          )}

          {editing ? (
            <Pressable accessibilityRole="button" style={dimPressed(styles.delete)} onPress={() => onDelete(editing)}>
              <Txt style={styles.deleteText}>템플릿 지우기</Txt>
            </Pressable>
          ) : (
            <Txt style={styles.hint}>만든 템플릿은 하루 마무리에서 길게 눌러 고치거나 지울 수 있어요.</Txt>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  sheet: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerButton: { minHeight: HIT, minWidth: HIT, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  headerText: { fontSize: 15 },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.inkSoft },
  name: {
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    fontSize: 17,
    fontFamily: fonts.body,
    color: colors.ink,
    paddingHorizontal: 2,
  },
  question: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  no: { width: 18, fontSize: 13, color: colors.muted },
  questionInput: { flex: 1, height: 46, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  removeQ: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 18, color: colors.faint },
  add: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  addText: { fontSize: 14, color: colors.navy },
  preview: { paddingVertical: 0, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.lineFaint },
  previewName: { fontSize: 22, lineHeight: 32 },
  previewQ: { fontSize: 14, lineHeight: 32, color: colors.inkSoft },
  error: { color: colors.danger, fontSize: 14 },
  delete: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 15, color: colors.danger },
  hint: { marginTop: 12, fontSize: 12, color: colors.muted },
});
