import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../ui/theme';

export const TURN_MS = 760; // 한 장이 넘어가는 시간
export const TURN_REDUCED_MS = 300; // 동작 줄이기: 넘기지 않고 흐리게만 바뀐다
export const TURN_EASE = Easing.bezier(0.45, 0.05, 0.25, 1);
const TURN_ANGLE = '-100deg'; // 90°를 넘으면 뒷면이라 보이지 않는다. 조금 더 돌려 끝을 감춘다

type Props = {
  progress: Animated.Value; // 0 제자리 → 1 왼쪽 모서리를 축으로 넘어가 사라짐
  width: number;
  reduce: boolean;
  children: ReactNode; // 넘어가는 장(다 써진 채로)
};

// 넘어가는 노트 한 장. 앞으로 넘길 때는 0→1로 지금 장이 넘어가고, 뒤로 넘길 때는 1→0으로 앞 장이 덮여 온다.
// 넘어갈수록 빛을 덜 받아 바깥쪽(오른쪽)부터 어두워진다. 동작 줄이기면 돌리지 않고 흐려지기만 한다.
export function TurningSheet({ progress, width, reduce, children }: Props) {
  const rotateY = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', TURN_ANGLE] });
  const fade = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sheet,
        reduce ? { opacity: fade } : { transform: [{ perspective: Math.max(1800, width * 4.6) }, { rotateY }] },
      ]}
    >
      {children}
      {!reduce && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="onboarding-turn-shade" x1="1" y1="0" x2="0" y2="0">
                <Stop offset="0" stopColor={colors.shadow} stopOpacity={0.32} />
                <Stop offset="0.65" stopColor={colors.shadow} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#onboarding-turn-shade)" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paper,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
});
