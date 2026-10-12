import { useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, SCREEN_X } from '../../ui/theme';

// 공책 한 쪽: 왼쪽 여백선과 50pt 간격 줄. 여백선 왼쪽 칸에 기호, 오른쪽에 글을 쓴다.
// NOTE_MARGIN은 화면 왼쪽 끝에서 여백선까지의 거리. 줄(ItemRow)이 기호·글 자리를 맞출 때 이 값을 쓴다.
export const NOTE_MARGIN = 48;
export const RULE_GAP = 50; // 줄 간격(줄 하나의 높이와 같다)

// 여백선 색은 이 화면에만 쓰여 여기 둔다(옅은 붉은 줄, 50% 불투명)
const MARGIN_RULE = 'rgba(226, 185, 166, 0.5)'; // #E2B9A6

// 목록 뒤 여백선. 목록 머리(입력칸) 아래에서 시작해, 스크롤하면 머리와 함께 올라가다 맨 위에 닿으면 머문다.
// scrollY는 네이티브 드라이버로 받은 스크롤 값이라 JS를 거치지 않고 움직인다.
export function MarginRule({ scrollY, startY }: { scrollY: Animated.Value; startY: number }) {
  const start = Math.max(1, startY);
  const translateY = scrollY.interpolate({
    inputRange: [0, start],
    outputRange: [start, 0],
    extrapolateLeft: 'extend', // 맨 위에서 당겨 내리면 목록을 따라 내려온다
    extrapolateRight: 'clamp',
  });
  return <Animated.View pointerEvents="none" style={[styles.margin, { transform: [{ translateY }] }]} />;
}

// 마지막 줄 아래 남은 자리를 빈 줄로 채운다. 목록 꼬리 안에 있어 줄과 함께 스크롤된다.
export function RuledFill({ style }: { style?: StyleProp<ViewStyle> }) {
  const [height, setHeight] = useState(0);
  const count = Math.floor(height / RULE_GAP);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.line, { top: (i + 1) * RULE_GAP - StyleSheet.hairlineWidth }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 목록은 화면 좌우 여백 안에 있으니 그만큼 빼서 화면 기준 NOTE_MARGIN에 맞춘다
  margin: { position: 'absolute', top: 0, bottom: 0, left: NOTE_MARGIN - SCREEN_X, width: 1, backgroundColor: MARGIN_RULE },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.ruled },
});
