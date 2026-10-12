import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { useReduceMotion } from './useReduceMotion';

// 글자 아래쪽에 칠한 형광펜 띠(목업: 55%~92% 높이).
// animate: 방금 사용자가 칠했을 때만 왼쪽에서 오른쪽으로 긋는다(불러온 목록은 그대로 보여준다).
export function Highlight({ on, animate = false, children }: { on: boolean; animate?: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      {animate ? <DrawnBand /> : <View pointerEvents="none" style={styles.band} />}
      {children}
    </View>
  );
}

function DrawnBand() {
  const reduce = useReduceMotion();
  const drawn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(drawn, { toValue: 1, duration: reduce ? 150 : 220, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // 칠할 때 한 번만
  }, []);
  // 동작 줄이기면 긋지 않고 흐리게만 나타난다
  const style = reduce ? { opacity: drawn } : { transform: [{ scaleX: drawn }] };
  return <Animated.View pointerEvents="none" style={[styles.band, styles.fromLeft, style]} />;
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, paddingHorizontal: 3 },
  band: { position: 'absolute', left: 0, right: 0, top: '55%', bottom: '8%', backgroundColor: colors.highlight },
  fromLeft: { transformOrigin: 'left center' },
});
