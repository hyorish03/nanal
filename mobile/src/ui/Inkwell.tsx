import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import { inkLevel } from '../days/moods';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { useReduceMotion } from './useReduceMotion';

const WELL = 'M8 70H40C43 70 44.5 67 43 64L36 50C35 48 33 47 31 47H17C15 47 13 48 12 50L5 64C3.5 67 5 70 8 70Z';

type Props = {
  id: string; // clipPath id (화면 안에서 겹치지 않게)
  mood: number | null; // 없으면 빈 병
  size: 'large' | 'small';
  selected?: boolean; // 큰 병: 깃펜을 꽂는다
  animate?: boolean; // 큰 병: 사용자가 고른 뒤에만 깃펜을 내려 꽂는다(처음 불러올 때는 그대로)
  color?: string;
  paper?: string; // 병 안쪽 바탕색
  scale?: number; // 큰 병: 넓은 화면에서 키운다(그림 비율은 그대로)
};

export function Inkwell({ id, mood, size, selected = false, animate = false, color = colors.navy, paper = colors.paperEvening, scale = 1 }: Props) {
  const fillY = mood === null ? 80 : 70 - 23 * inkLevel(mood);
  if (size === 'small') {
    return (
      <Svg width={16} height={20} viewBox="0 36 48 36" fill="none" accessible={false}>
        <Defs>
          <ClipPath id={id}>
            <Path d={WELL} />
          </ClipPath>
        </Defs>
        <Rect x={4} y={fillY} width={40} height={30} fill={color} clipPath={`url(#${id})`} />
        <Path d={WELL} stroke={color} strokeWidth={3} />
        <Rect x={17} y={40} width={14} height={7} stroke={color} strokeWidth={3} />
      </Svg>
    );
  }
  return <LargeInkwell id={id} fillY={fillY} selected={selected} animate={animate} color={color} paper={paper} scale={scale} />;
}

type LargeProps = { id: string; fillY: number; selected: boolean; animate: boolean; color: string; paper: string; scale: number };

// 깃펜은 네이티브 드라이버로 움직이도록 SVG 밖의 겹친 View에 따로 그린다. 병 뒤에 있어야 끝이 잉크에 잠겨 보인다.
function LargeInkwell({ id, fillY, selected, animate, color, paper, scale }: LargeProps) {
  const reduce = useReduceMotion();
  const quill = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    if (!animate || !selected) {
      quill.setValue(selected ? 1 : 0);
      return;
    }
    quill.setValue(0);
    const anim = Animated.timing(quill, { toValue: 1, duration: 180, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [selected, animate, quill]);

  const translateY = reduce ? 0 : quill.interpolate({ inputRange: [0, 1], outputRange: [-6 * scale, 0] });
  const width = LARGE_W * scale;
  const height = LARGE_H * scale;
  return (
    <View style={{ width, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: quill, transform: [{ translateY }] }]}>
        <Svg width={width} height={height} viewBox="0 0 48 72" fill="none" accessible={false}>
          <Path d="M23 56L40 9" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
          <Path d="M29.5 37C25.5 27 30 13 43.5 2C45 15.5 40.5 29 29.5 37Z" fill={color} />
          <Path
            d="M31 31L37 29M32.5 26L39 23.5M34.5 21L40.5 17.5M36.5 16L41.5 12M38.5 11L42.5 7"
            stroke={paper}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Svg width={width} height={height} viewBox="0 0 48 72" fill="none" accessible={false}>
        <Defs>
          <ClipPath id={id}>
            <Path d={WELL} />
          </ClipPath>
        </Defs>
        <Path d={WELL} fill={paper} />
        <Rect x={4} y={fillY} width={40} height={30} fill={color} clipPath={`url(#${id})`} />
        <Path d={WELL} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        <Rect x={18} y={41} width={12} height={6} fill={paper} stroke={color} strokeWidth={1.5} />
        <Rect x={15.5} y={37} width={17} height={4.5} rx={1.2} fill={color} />
        <Path d="M33 54L38 64" stroke={colors.card} strokeWidth={2.4} strokeLinecap="round" />
        <Path d="M27 43V46" stroke={colors.card} strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const LARGE_W = 48;
const LARGE_H = 72;
