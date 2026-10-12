import { type PressableStateCallbackType, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

// 누르는 동안의 모양. 애니메이션 없이 손가락이 닿는 순간 바뀌고, 떼면 돌아온다.
type PressStyle = (state: PressableStateCallbackType) => StyleProp<ViewStyle>;

// 버튼, 칩: 살짝 흐려진다
export function dimPressed(style: StyleProp<ViewStyle>): PressStyle {
  return ({ pressed }) => [style, pressed && styles.dim];
}

// 목록 줄: 종이에 옅은 그늘이 진다
export function tintPressed(style: StyleProp<ViewStyle>): PressStyle {
  return ({ pressed }) => [style, pressed && styles.tint];
}

const styles = StyleSheet.create({
  dim: { opacity: 0.6 },
  tint: { backgroundColor: 'rgba(42, 37, 32, 0.05)' },
});
