import { type Ref, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, type StyleProp, type View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CHIP_H } from '../../ui/Chip';
import { EASE_OUT } from '../../ui/motion';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';

// 지난 기록으로 가는 책갈피 끈. 화면 맨 위 가장자리(상태 막대 아래까지)에서 늘어져, 안전 영역 아래로 56pt가 보인다.
// 끝은 표지 띠처럼 V자로 파였고, 오른쪽 가장자리는 더 짙다.
export const RIBBON_W = 14;
const RIBBON_H = 56; // 안전 영역 아래로 보이는 길이
const NOTCH = 7;
const PULL = 8; // 누르는 동안 끈이 당겨 내려오는 거리
const SLOP = (44 - RIBBON_W) / 2; // 누르는 영역은 44pt
const ROW_TOP = 12; // 오늘 화면 위 여백. 글씨는 하루 마무리 버튼 줄 가운데에 맞춘다
const CAPTION_GAP = 6;
const CAPTION_W = 96; // 글씨를 키워도(최대 1.4배) 한 줄에 들어가는 폭
const CAPTION_SCALE = 1.4;

type Props = { onPress: () => void; style?: StyleProp<ViewStyle>; targetRef?: Ref<View> }; // targetRef: 처음 한 번 코치마크가 가리킨다

// 손으로 끌어내리는 동작은 없다(react-native-gesture-handler가 없어서). 누르는 동안 살짝 당겨지고, 떼면 돌아오며 열린다.
// 끈 왼쪽에 작은 "지난 기록" 글씨를 붙여 무엇인지 알 수 있게 한다(하루 마무리 버튼과 같은 줄, 상태 막대 아래).
export function Ribbon({ onPress, style, targetRef }: Props) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const reduce = useReduceMotion();
  const pull = useRef(new Animated.Value(0)).current;
  const [captionH, setCaptionH] = useState(0);
  const h = insets.top + RIBBON_H;

  const to = (v: number) => Animated.timing(pull, { toValue: v, duration: 160, easing: EASE_OUT, useNativeDriver: true }).start();
  // 동작 줄이기에서는 움직이지 않고 흐리게만
  const translateY = reduce ? 0 : pull.interpolate({ inputRange: [0, 1], outputRange: [0, PULL] });
  const opacity = reduce ? pull.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) : 1;
  // 하루 마무리 버튼도 글씨 크기를 따라 커지니 같은 비율로 키운 줄 높이 가운데에 둔다
  const rowH = CHIP_H * Math.max(1, Math.min(fontScale, CAPTION_SCALE));
  const captionTop = insets.top + ROW_TOP + Math.max(0, (rowH - captionH) / 2);

  return (
    <Pressable
      ref={targetRef}
      accessibilityRole="button"
      accessibilityLabel="지난 기록"
      accessibilityHint="지난 날의 기록을 봐요"
      hitSlop={{ left: SLOP, right: SLOP }}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      onPress={onPress}
      // 상태 막대 밑까지 올라가 화면 맨 위에 매달린다
      style={[styles.wrap, { top: -insets.top, height: h }, style]}
    >
      <Animated.View style={{ transform: [{ translateY }], opacity }}>
        <Svg width={RIBBON_W} height={h} viewBox={`0 0 ${RIBBON_W} ${h}`}>
          <Path d={`M0 0H${RIBBON_W}V${h}L${RIBBON_W / 2} ${h - NOTCH}L0 ${h}Z`} fill={colors.navy} />
          <Path d={`M${RIBBON_W - 3} 0H${RIBBON_W}V${h}L${RIBBON_W - 3} ${h - 3}Z`} fill={colors.navyDeep} />
        </Svg>
      </Animated.View>
      <Txt
        variant="caption"
        // 글씨 크기가 바뀌면 다시 재서 가운데를 맞춘다
        key={fontScale}
        importantForAccessibility="no"
        accessibilityElementsHidden
        numberOfLines={1}
        maxFontSizeMultiplier={CAPTION_SCALE}
        onLayout={(e) => setCaptionH(e.nativeEvent.layout.height)}
        style={[styles.caption, { top: captionTop }]}
      >
        지난 기록
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', width: RIBBON_W, zIndex: 2 },
  caption: { position: 'absolute', right: RIBBON_W + CAPTION_GAP, width: CAPTION_W, textAlign: 'right' },
});
