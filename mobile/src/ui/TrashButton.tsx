import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { dimPressed } from './press';
import { colors } from './theme';

// 글자 없이 휴지통만 그린 지우기 버튼. 보이는 칸은 줄 높이(height)에 맞추고, 누르는 폭은 44pt를 지킨다.
export function TrashButton({ label, height, onPress }: { label: string; height: number; onPress: () => void }) {
  const slop = Math.max(0, (44 - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: slop, bottom: slop }}
      style={dimPressed([styles.button, { height }])}
      onPress={onPress}
    >
      <Svg width={17} height={17} viewBox="0 0 16 16" accessible={false}>
        <Path
          d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"
          fill="none"
          stroke={colors.danger}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
});
