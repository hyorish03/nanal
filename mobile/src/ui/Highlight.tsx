import { cloneElement, type ReactElement, useEffect, useRef, useState } from 'react';
import { Animated, Easing, type NativeSyntheticEvent, StyleSheet, type TextLayoutEventData, type TextProps, View } from 'react-native';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { useReduceMotion } from './useReduceMotion';

type Line = { x: number; y: number; width: number; height: number };

const PAD = 3; // 띠가 글자 양옆으로 조금 더 나온다
const TOP = 0.55; // 목업: 줄 높이의 55%~92%
const BOTTOM = 0.92;
const STROKE = 220; // 한 줄 긋는 시간

// 글자 아래쪽에 칠한 형광펜 띠. 줄바꿈된 글도 줄마다 띠를 깐다(onTextLayout으로 줄 위치를 잰다).
// 자식은 Txt 하나여야 한다. 칠하든 안 칠하든 글 자리는 같다(띠만 글자 양옆으로 PAD만큼 삐져나온다).
// animate: 방금 사용자가 칠했을 때만 왼쪽에서 오른쪽으로, 윗줄부터 긋는다(불러온 목록은 그대로 보여준다).
export function Highlight({ on, animate = false, children }: { on: boolean; animate?: boolean; children: ReactElement<TextProps> }) {
  // 칠하지 않을 때도 줄을 재 둔다(줄바꿈이 그대로라 칠할 때 다시 재지 않는다)
  const [lines, setLines] = useState<Line[]>([]);
  const onTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    children.props.onTextLayout?.(e);
    const next = e.nativeEvent.lines.filter((l) => l.width > 0).map(({ x, y, width, height }) => ({ x, y, width, height }));
    setLines((prev) => (same(prev, next) ? prev : next));
  };
  return (
    <View style={styles.wrap}>
      {on && lines.length > 0 && (animate ? <DrawnBands lines={lines} /> : lines.map((l, i) => <View key={i} pointerEvents="none" style={[styles.band, bandRect(l)]} />))}
      {cloneElement(children, { onTextLayout })}
    </View>
  );
}

function DrawnBands({ lines }: { lines: Line[] }) {
  const reduce = useReduceMotion();
  const drawn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(drawn, {
      toValue: reduce ? 1 : lines.length,
      duration: reduce ? 150 : STROKE * lines.length,
      easing: reduce || lines.length === 1 ? EASE_OUT : Easing.linear, // 여러 줄은 끊기지 않게 고르게
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
    // 칠할 때 한 번만
  }, []);
  // 다 그은 뒤 줄 수가 바뀌면(회전, 글자 크기) 새 줄도 칠해 둔다
  const count = useRef(lines.length);
  useEffect(() => {
    if (count.current === lines.length) return;
    count.current = lines.length;
    drawn.stopAnimation();
    drawn.setValue(reduce ? 1 : lines.length);
  }, [lines.length]);
  return (
    <>
      {lines.map((l, i) => {
        // 동작 줄이기면 긋지 않고 흐리게만 나타난다
        const style = reduce
          ? { opacity: drawn }
          : { transform: [{ scaleX: drawn.interpolate({ inputRange: [i, i + 1], outputRange: [0, 1], extrapolate: 'clamp' }) }] };
        return <Animated.View key={i} pointerEvents="none" style={[styles.band, styles.fromLeft, bandRect(l), style]} />;
      })}
    </>
  );
}

function bandRect(l: Line) {
  return { left: l.x - PAD, width: l.width + PAD * 2, top: l.y + l.height * TOP, height: l.height * (BOTTOM - TOP) };
}

function same(a: Line[], b: Line[]) {
  return a.length === b.length && a.every((l, i) => l.x === b[i].x && l.y === b[i].y && l.width === b[i].width && l.height === b[i].height);
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1 },
  band: { position: 'absolute', backgroundColor: colors.highlight },
  fromLeft: { transformOrigin: 'left center' },
});
