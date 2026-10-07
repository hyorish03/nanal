import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

type Props = { lineHeight?: number; style?: StyleProp<ViewStyle>; children: ReactNode };

// 줄 노트 카드. 높이에 맞춰 lineHeight 간격으로 선을 긋는다.
export function RuledPaper({ lineHeight = 32, style, children }: Props) {
  const [height, setHeight] = useState(0);
  const count = Math.floor(height / lineHeight);
  return (
    <View style={[styles.paper, style]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.line, { top: (i + 1) * lineHeight - 1 }]} />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.card, borderRadius: 2, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.ruled },
});
