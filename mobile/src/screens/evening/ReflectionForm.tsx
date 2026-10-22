import { useRef } from 'react';
import { Pressable, type StyleProp, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { MAX_ANSWER_LENGTH } from '../../reflections/repo';
import type { TemplateQuestion } from '../../reflections/templates';
import { dimPressed } from '../../ui/press';
import { RuledPaper } from '../../ui/RuledPaper';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { macText } from '../../ui/desktop';
import { answerLines, useRule } from './rule';

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
  // 선은 줄 상자 맨 아래에서 sit만큼 올라와 글자 기준선 바로 밑에 그어진다
  const rule = useRule();
  const formQ = { fontSize: rule.hand, lineHeight: rule.lineHeight };
  // 적을 자리를 넉넉히 비워 둔다(질문 하나면 5줄). 글이 길어지면 칸이 따라 늘어난다.
  // 입력칸 글자는 줄 상자 바닥에 붙어 그려지므로(rule.ts) 칸을 inputLift만큼 올려 질문 글씨와 같은 자리에 앉힌다
  const answer = {
    minHeight: rule.line * answerLines(questions.length),
    fontSize: rule.body,
    lineHeight: rule.lineHeight,
    transform: [{ translateY: -rule.inputLift }],
  };

  // 버튼은 쓰는 줄 위에 얹지 않고, 줄 아래 점선으로 나눈 칸에 따로 둔다
  const footer = (
    <View ref={button} style={styles.footer}>
      <Svg width="100%" height={1} style={styles.dash} accessible={false} pointerEvents="none">
        <Line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={colors.ink} strokeOpacity={0.2} strokeWidth={1} strokeDasharray="4 3" />
      </Svg>
      <View style={styles.actions}>
        {onCancel && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.cancel)} onPress={onCancel}>
            <Txt style={styles.cancelText}>취소</Txt>
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
    </View>
  );

  return (
    <RuledPaper
      lineHeight={rule.line}
      firstLineTop={top + rule.line - rule.sit}
      style={[styles.form, { paddingTop: top }, style]}
      footer={footer}
    >
      {title !== undefined && (
        <Txt variant="hand" style={formQ}>
          {title}
        </Txt>
      )}
      {questions.map((q) => (
        <View key={q.key} ref={(v) => void fields.set(q.key, v)}>
          {q.text !== '' && (
            <Txt variant="hand" style={formQ} accessible={false} importantForAccessibility="no">
              {q.text}
            </Txt>
          )}
          <TextInput
            style={macText([styles.answer, answer])}
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
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  // 질문과 답이 모두 같은 줄 간격(rule)으로 쌓여야 글자가 선 위에 앉는다(gap을 두지 않는다)
  form: { paddingHorizontal: 16, paddingBottom: 4 },
  answer: { fontFamily: fonts.body, color: colors.ink, padding: 0, textAlignVertical: 'top' },
  // 고칠 때 카드(paddingVertical 0)에서도 버튼이 카드 밑변에 붙지 않게 아래 여백은 여기서 준다
  footer: { marginTop: 8, paddingBottom: 10 },
  dash: { marginBottom: 10 },
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
