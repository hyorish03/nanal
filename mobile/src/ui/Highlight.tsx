import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

// 글자 아래쪽에 칠한 형광펜 띠(목업: 55%~92% 높이).
export function Highlight({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.band} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, paddingHorizontal: 3 },
  band: { position: 'absolute', left: 0, right: 0, top: '55%', bottom: '8%', backgroundColor: colors.highlight },
});
