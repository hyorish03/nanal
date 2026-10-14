import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

type Props = {
  lineHeight?: number;
  // 첫 선의 y. 카드 안쪽 여백과 글자 기준선에 맞춰 주면 글자가 선 위에 앉는다. 기본은 lineHeight - 1.
  firstLineTop?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  // 줄 아래에 따로 두는 칸(버튼 줄 등). 있으면 선은 children이 차지한 곳까지만 긋는다.
  footer?: ReactNode;
};

// 줄 노트 카드. 높이에 맞춰 lineHeight 간격으로 선을 긋는다.
export function RuledPaper({ lineHeight = 32, firstLineTop, style, children, footer }: Props) {
  const [height, setHeight] = useState(0);
  const [bodyBottom, setBodyBottom] = useState(0);
  const first = firstLineTop ?? lineHeight - 1;
  const bottom = footer === undefined ? height : bodyBottom;
  const count = bottom >= first + 1 ? Math.floor((bottom - 1 - first) / lineHeight) + 1 : 0;
  return (
    <View style={[styles.paper, style]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.line, { top: first + i * lineHeight }]} />
      ))}
      {footer === undefined ? (
        children
      ) : (
        <>
          {/* 카드 위에서부터 글 칸 끝까지의 y. 선은 여기까지만 */}
          <View onLayout={(e) => setBodyBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>{children}</View>
          {footer}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.card, borderRadius: 2, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.ruled },
});
