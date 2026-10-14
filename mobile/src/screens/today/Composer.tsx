import { memo, type Ref, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { type ItemKind, MAX_TEXT } from '../../items/repo';
import { Chip } from '../../ui/Chip';
import { Popover, useAnchor } from '../../ui/Popover';
import { haptic } from '../../ui/haptics';
import { dimPressed } from '../../ui/press';
import { colors, fonts } from '../../ui/theme';
import { SymbolLegend } from './SymbolLegend';
import { useScaledText } from '../../ui/typeScale';

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'note', symbol: '–', label: '메모' },
];

type Props = {
  inputRef: Ref<TextInput>;
  voice: boolean; // 말로 적기를 쓸 수 있으면 마이크, 아니면 정리해서 넣기
  onCapture: () => void;
  // 저장하고 성공 여부를 돌려준다. 성공하면 칸을 비운다.
  onSubmit: (kind: ItemKind, text: string) => Promise<boolean>;
};

// 입력칸과 종류 칩. 글자를 칠 때마다 여기만 다시 그려진다(목록 줄은 그대로).
export const Composer = memo(function Composer({ inputRef, voice, onCapture, onSubmit }: Props) {
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const info = useAnchor();
  const inputStyle = useScaledText(styles.input);
  const pickKind = (next: ItemKind) => {
    if (next === kind) return;
    haptic.select();
    setKind(next);
  };

  // 빈 칸에서 완료를 누르면 키보드만 내린다
  const submit = async () => {
    if (!text.trim()) {
      Keyboard.dismiss();
      return;
    }
    if (await onSubmit(kind, text)) setText('');
  };

  return (
    <View style={styles.inputBlock}>
      <View style={styles.inputRow}>
        <TextInput
          style={inputStyle}
          ref={inputRef}
          placeholder={kind === 'task' ? '할 일 한 줄' : '메모 한 줄'}
          placeholderTextColor={colors.muted}
          maxLength={MAX_TEXT}
          accessibilityLabel={kind === 'task' ? '새 할 일' : '새 메모'}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voice ? '말로 적기' : '정리해서 넣기'}
          accessibilityHint={voice ? '말한 내용을 할 일과 메모로 정리해요' : '두서없이 쓴 글을 할 일과 메모로 정리해요'}
          style={dimPressed(styles.organize)}
          onPress={onCapture}
        >
          {voice ? (
            <Svg width={22} height={22} viewBox="0 0 18 18" fill="none">
              <Rect x={6} y={1.5} width={6} height={10} rx={3} stroke={colors.inkSoft} strokeWidth={1.4} />
              <Path d="M3 8.5a6 6 0 0 0 12 0M9 14.5v2.5" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinecap="round" />
            </Svg>
          ) : (
            <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
              <Path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 0 1 3 3L8 15l-4 1Z" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinejoin="round" />
              <Path d="M12 5l3 3" stroke={colors.inkSoft} strokeWidth={1.4} />
            </Svg>
          )}
        </Pressable>
      </View>
      <View style={styles.kindRow}>
        {KINDS.map((k) => (
          <Chip key={k.kind} label={k.label} symbol={k.symbol} selected={kind === k.kind} onPress={() => pickKind(k.kind)} />
        ))}
        <Pressable
          ref={info.ref}
          accessibilityRole="button"
          accessibilityLabel="기호 설명"
          accessibilityState={{ expanded: info.anchor !== null }}
          style={dimPressed(styles.info)}
          onPress={info.open}
        >
          <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
            <Circle cx={10} cy={10} r={8.2} stroke={colors.muted} strokeWidth={1.3} />
            <Path d="M10 9v5" stroke={colors.muted} strokeWidth={1.4} strokeLinecap="round" />
            <Circle cx={10} cy={6.2} r={1.1} fill={colors.muted} />
          </Svg>
        </Pressable>
      </View>
      <Popover anchor={info.anchor} align="left" width={300} label="기호 설명" onClose={info.close}>
        <SymbolLegend kind={kind} onClose={info.close} />
      </Popover>
    </View>
  );
});

const styles = StyleSheet.create({
  inputBlock: { gap: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.ink, paddingBottom: 6 },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 6, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  organize: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  info: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
});
