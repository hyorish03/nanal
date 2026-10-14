import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '../../ui/theme';
import { type NoteMode, RULE_GAP } from './notebook';
import { FADE_MS, LEAVE_MS, leaveDelay, POP_MS, WRITE_MS, writeDelay } from './notePages';

// 노트 한 장 안의 글씨·그림이 함께 쓰는 값. s는 noteScale(폭 390 기준 배율)
export type NoteCtx = {
  mode: NoteMode;
  reduce: boolean;
  s: number;
  width: number;
  nudge: number; // 글자 크기 설정으로 줄 높이가 늘어난 만큼 위로 당겨 글줄을 칸 가운데에 둔다
};
export const NoteContext = createContext<NoteCtx>({ mode: 'still', reduce: false, s: 1, width: 390, nudge: 0 });
export const useNote = () => useContext(NoteContext);

// 글줄은 칸이 정해진 격자라 시스템 글자 크기는 이만큼까지만 따른다
export const NOTE_FONT_SCALE = 1.15;

// 목업 Main의 곡선. write는 펜이 느려졌다 멈추듯, pop은 살짝 지나쳤다 붙는다
const WRITE_EASE = Easing.bezier(0.35, 0.1, 0.3, 1);
const POP_EASE = Easing.bezier(0.2, 0.9, 0.25, 1.2);
const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// 써지는 효과를 자르는 상자의 여유. 손글씨 끝이나 형광펜 띠가 글자 상자 밖으로 조금 나와도 잘리지 않는다
const PAD = 12;

type Props = {
  i: number; // 써지는 차례(목업의 --i)
  pop?: boolean; // 그림·책갈피·포스트잇처럼 툭 붙는 것
  left?: number; // 이미 배율을 곱한 값
  right?: number;
  top: number;
  maxWidth?: number; // 글이 들어갈 수 있는 폭. 넘치면 글자가 줄어든다
  grid?: boolean; // 글줄이면 true(글자 크기 보정을 받는다)
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// 노트에 쓰인 것 하나. write면 차례대로 왼쪽부터 써지거나(글·선) 툭 붙고(pop), still이면 그대로, leave면 흐려지며 사라진다.
// 써지는 효과는 폭을 움직이지 않고, 잘린 상자를 왼쪽에서 밀어 넣고 속은 반대로 밀어 제자리에 둔다(네이티브 드라이버).
export function Ink({ i, pop = false, left, right, top, maxWidth, grid = true, style, children }: Props) {
  const { mode, reduce, s, nudge } = useNote();
  const p = useRef(new Animated.Value(mode === 'write' ? 0 : 1)).current; // 나타난 정도
  const out = useRef(new Animated.Value(0)).current; // 사라진 정도
  const [w, setW] = useState(0);

  useEffect(() => {
    if (mode === 'write') {
      p.setValue(0);
      out.setValue(0);
      const anim = Animated.timing(p, {
        toValue: 1,
        delay: writeDelay(i),
        duration: reduce ? FADE_MS : pop ? POP_MS : WRITE_MS,
        easing: reduce ? CSS_EASE : pop ? POP_EASE : WRITE_EASE,
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }
    if (mode === 'leave') {
      // 아직 써지는 중이었다면 거기서 멈추고 그대로 흐려진다
      p.stopAnimation();
      const anim = Animated.timing(out, { toValue: 1, delay: leaveDelay(i), duration: LEAVE_MS, easing: CSS_EASE, useNativeDriver: true });
      anim.start();
      return () => anim.stop();
    }
    // still: 쓰던 중이어도 다 쓴 모습으로 건너뛴다
    p.setValue(1);
    out.setValue(0);
  }, [mode, reduce]);

  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const drift = reduce ? 0 : out.interpolate({ inputRange: [0, 1], outputRange: [0, -3 * s] });
  const pad = pop ? 0 : PAD;
  const place = {
    top: top - pad + (grid ? nudge : 0),
    left: left === undefined ? undefined : left - pad,
    right: right === undefined ? undefined : right - pad,
    maxWidth: maxWidth === undefined ? undefined : maxWidth + pad * 2,
  };

  let shown: object;
  let inner: object | undefined;
  if (reduce) {
    shown = { opacity: p };
  } else if (pop) {
    shown = {
      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      transform: [
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-14 * s, 0] }) },
        { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) },
      ],
    };
  } else {
    // 폭을 재기 전에는 숨겨 둔다(첫 프레임에 다 쓴 글이 비치지 않게)
    shown = {
      overflow: 'hidden',
      opacity: p.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 1, 1] }),
      transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }],
    };
    inner = { transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [w, 0] }) }] };
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.place, place, { opacity: fade, transform: [{ translateY: drift }] }]}>
      <Animated.View style={[{ padding: pad }, shown]} onLayout={pop ? undefined : (e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[inner, style]}>{children}</Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const FACE = {
  title: { fontFamily: fonts.hand, fontSize: 36, color: colors.navy },
  head: { fontFamily: fonts.hand, fontSize: 30, color: colors.navy },
  body: { fontFamily: fonts.title, fontSize: 17, color: colors.navy },
  note: { fontFamily: fonts.note, fontSize: 19, color: colors.noteRed },
  date: { fontFamily: fonts.note, fontSize: 19, color: colors.muted },
  postit: { fontFamily: fonts.title, fontSize: 17, color: colors.postitText },
} as const;
export type NoteFace = keyof typeof FACE;

// 노트 글줄 하나. 한 칸(36) 높이에 글자 아래가 줄 바로 위에 앉는다. 좁은 휴대폰에서 넘치면 한 줄 안에서 글자가 줄어든다.
export function NoteText({ face, shrink = false, children }: { face: NoteFace; shrink?: boolean; children: ReactNode }) {
  const { s } = useNote();
  const f = FACE[face];
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={NOTE_FONT_SCALE}
      style={[{ fontFamily: f.fontFamily, color: f.color, fontSize: f.fontSize * s, lineHeight: RULE_GAP * s }, shrink && styles.shrink]}
    >
      {children}
    </Text>
  );
}

// 글 뒤에 그은 형광펜. title은 제목 밑을 비스듬히 크게 긋고, word는 낱말 하나 밑을 칠한다(목업의 띠 자리)
export function Marked({ kind, shrink = false, children }: { kind: 'title' | 'word'; shrink?: boolean; children: ReactNode }) {
  const { s } = useNote();
  const band =
    kind === 'title'
      ? [styles.titleBand, { left: -4 * s, right: -8 * s, top: 19 * s, height: 13 * s }]
      : [styles.wordBand, { left: -3 * s, right: -3 * s, top: 22 * s, height: 12 * s }];
  return (
    <View style={[styles.marked, shrink && styles.shrink]}>
      <View style={band} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  place: { position: 'absolute' },
  shrink: { flexShrink: 1 },
  marked: { alignSelf: 'flex-start' },
  titleBand: {
    position: 'absolute',
    backgroundColor: colors.highlight,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 6,
    transform: [{ rotate: '-1deg' }],
  },
  wordBand: { position: 'absolute', backgroundColor: colors.highlight, borderRadius: 4 },
});
