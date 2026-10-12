import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

type Props = {
  lineHeight?: number;
  // 첫 선의 y. 카드 안쪽 여백과 글자 기준선에 맞춰 주면 글자가 선 위에 앉는다. 기본은 lineHeight - 1.
  firstLineTop?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// 줄 노트 카드. 높이에 맞춰 lineHeight 간격으로 선을 긋는다.
export function RuledPaper({ lineHeight = 32, firstLineTop, style, children }: Props) {
  const [height, setHeight] = useState(0);
  const first = firstLineTop ?? lineHeight - 1;
  const count = height >= first + 1 ? Math.floor((height - 1 - first) / lineHeight) + 1 : 0;
  return (
    <View style={[styles.paper, style]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.line, { top: first + i * lineHeight }]} />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.card, borderRadius: 2, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.ruled },
});
