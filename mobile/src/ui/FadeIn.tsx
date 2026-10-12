import { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';
import { EASE_OUT } from './motion';

type Props = ViewProps & {
  on?: boolean; // false면 처음부터 보인다
  duration: number;
  delay?: number;
  rise?: number; // 아래에서 이만큼 올라오며 나타난다. 동작 줄이기면 0을 넘긴다
};

// 처음 그릴 때 한 번만 흐리게 나타난다. 누르기·스크롤은 막지 않는다.
export function FadeIn({ on = true, duration, delay = 0, rise = 0, style, children, ...rest }: Props) {
  const v = useRef(new Animated.Value(on ? 0 : 1)).current;
  useEffect(() => {
    if (!on) return;
    const anim = Animated.timing(v, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // 마운트할 때 한 번만
  }, []);
  const transform = rise ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] : undefined;
  return (
    <Animated.View {...rest} style={[style, { opacity: v, transform }]}>
      {children}
    </Animated.View>
  );
}
