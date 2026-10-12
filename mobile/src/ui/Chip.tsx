import { Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { dimPressed } from './press';
import { colors, fonts } from './theme';
import { Txt } from './Txt';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  selected?: boolean;
  symbol?: string; // 앞에 붙는 기호(•, – 등)
  dashed?: boolean; // 새로 만들기처럼 아직 없는 것을 가리킬 때
  style?: StyleProp<ViewStyle>;
};

// 보이는 높이는 34, 누르는 영역은 hitSlop으로 44pt를 지킨다
export const CHIP_H = 34;
const SLOP = (44 - CHIP_H) / 2;

// 고르는 칩. 고른 칩은 종이색이 조금 짙어지고 먹색 테두리가 된다(형광펜은 '중요'에만 쓴다).
export function Chip({ label, selected = false, symbol, dashed = false, style, accessibilityState, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={symbol ? label : undefined}
      hitSlop={{ top: SLOP, bottom: SLOP }}
      accessibilityState={{ ...accessibilityState, selected }}
      {...rest}
      style={dimPressed([styles.chip, dashed && styles.dashed, selected && styles.selected, style])}
    >
      <Txt style={[styles.text, selected && styles.textSelected]}>{symbol ? `${symbol} ${label}` : label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: CHIP_H,
    paddingHorizontal: 14,
    borderRadius: CHIP_H / 2,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    justifyContent: 'center',
  },
  dashed: { borderStyle: 'dashed' },
  selected: { backgroundColor: colors.chipSelected, borderColor: colors.ink },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  textSelected: { fontFamily: fonts.medium },
});
