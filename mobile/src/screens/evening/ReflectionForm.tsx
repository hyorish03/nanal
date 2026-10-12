import { useRef } from 'react';
import { Pressable, type StyleProp, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { MAX_ANSWER_LENGTH } from '../../reflections/repo';
import type { TemplateQuestion } from '../../reflections/templates';
import { dimPressed } from '../../ui/press';
import { RuledPaper } from '../../ui/RuledPaper';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

// 줄 노트 간격. 선은 줄 상자 맨 아래에서 SIT만큼 올라와 글자 기준선 바로 밑에 그어진다.
export const RULE = 32;
export const SIT = 6;

type Props = {
  title?: string; // 고칠 때 맨 윗줄에 템플릿 이름
  questions: TemplateQuestion[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  submitLabel: string;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  keep: (field: View | null, button: View | null) => void; // 쓰는 칸과 버튼을 키보드 위로
  top?: number; // 카드 위쪽 여백
  style?: StyleProp<ViewStyle>;
};

// 회고 답을 적는 줄 노트. 새로 남길 때와 고칠 때 함께 쓴다.
export function ReflectionForm({ title, questions, values, onChange, submitLabel, canSubmit, onSubmit, onCancel, keep, top = 0, style }: Props) {
  const fields = useRef(new Map<string, View | null>()).current;
  const button = useRef<View>(null);
  const focused = useRef<string | null>(null);
  const follow = (key: string) => keep(fields.get(key) ?? null, button.current);

  return (
    <RuledPaper lineHeight={RULE} firstLineTop={top + RULE - SIT} style={[styles.form, { paddingTop: top }, style]}>
      {title !== undefined && (
        <Txt variant="hand" style={styles.formQ}>
          {title}
        </Txt>
      )}
      {questions.map((q) => (
        <View key={q.key} ref={(v) => void fields.set(q.key, v)}>
          {q.text !== '' && (
            <Txt variant="hand" style={styles.formQ} accessible={false} importantForAccessibility="no">
              {q.text}
            </Txt>
          )}
          <TextInput
            style={styles.answer}
            multiline
            maxLength={MAX_ANSWER_LENGTH}
            accessibilityLabel={q.text || title}
            value={values[q.key] ?? ''}
            onChangeText={(v) => onChange(q.key, v)}
            onFocus={() => {
              focused.current = q.key;
              follow(q.key);
            }}
            onBlur={() => {
              if (focused.current === q.key) focused.current = null;
            }}
            // 여러 줄로 길어지면 버튼이 키보드 밑으로 밀려나지 않게 다시 맞춘다
            onContentSizeChange={() => {
              if (focused.current === q.key) follow(q.key);
            }}
          />
        </View>
      ))}
      <View ref={button} style={styles.actions}>
        {onCancel && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.cancel)} onPress={onCancel}>
            <Txt style={styles.cancelText}>그만두기</Txt>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          accessibilityHint={canSubmit ? undefined : '한 줄이라도 적으면 남길 수 있어요'}
          disabled={!canSubmit}
          style={dimPressed([styles.save, !canSubmit && styles.saveOff])}
          onPress={onSubmit}
        >
          <Txt variant="medium" style={styles.saveText}>
            {submitLabel}
          </Txt>
        </Pressable>
      </View>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  // 질문과 답이 모두 RULE 간격으로 쌓여야 글자가 선 위에 앉는다(gap을 두지 않는다)
  form: { paddingHorizontal: 16, paddingBottom: 14 },
  formQ: { fontSize: 23, lineHeight: RULE },
  answer: { minHeight: RULE * 2, fontSize: 15, lineHeight: RULE, fontFamily: fonts.body, color: colors.ink, padding: 0, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  cancel: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { fontSize: 15, color: colors.inkSoft },
  save: {
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  saveOff: { opacity: 0.35 },
  saveText: { color: colors.card, fontSize: 15 },
});
