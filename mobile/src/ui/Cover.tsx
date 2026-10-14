import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, StyleSheet, type TextStyle, useWindowDimensions, View } from 'react-native';
import type { CoverOpening } from '../lib/coverOpening';
import { EASE_OUT } from './motion';
import { colors, fonts } from './theme';
import { Paper } from './Paper';
import { useLayoutClass } from './responsive';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

type Props = {
  open: boolean; // true면 펼쳐져 사라지고, false면 덮인다
  line: string; // 표지 아래 문구
  onClosed?: () => void; // 덮기가 끝났을 때
  onOpened?: () => void; // 펼치기가 끝났을 때
  opening?: CoverOpening; // 펼칠 때: turn은 책등 쪽으로 넘기고, fade는 짧게 흐려진다. 덮을 때는 늘 넘긴다
  children?: ReactNode; // 덮인 표지 위에 올릴 버튼 등
};

const DURATION = 820;
const FADE_MS = 300; // 같은 날 다시 열 때
const REDUCED_MS = 200; // 동작 줄이기: 돌리지 않고 흐리게만
const BOOK_RATIO = 0.7; // 넓은 창의 다이어리 한 권(가로 ÷ 세로)
const BOOK_MAX_H = 720;
const BOOK_MARGIN = 48; // 창 가장자리와 책 사이

// 넓은 창(아이패드·Mac)에서는 표지가 창을 다 덮지 않고, 종이 책상 가운데 다이어리 한 권으로 놓인다.
function bookSize(width: number, height: number) {
  let h = Math.min(height - BOOK_MARGIN * 2, BOOK_MAX_H);
  let w = Math.round(h * BOOK_RATIO);
  if (w > width - BOOK_MARGIN * 2) {
    w = width - BOOK_MARGIN * 2;
    h = Math.round(w / BOOK_RATIO);
  }
  return { width: w, height: h };
}

export function Cover({ open, line, onClosed, onOpened, opening = 'turn', children }: Props) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const book = useLayoutClass() === 'compact' ? null : bookSize(width, height);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current; // 0 덮임 → 1 넘어감
  const veil = useRef(new Animated.Value(1)).current; // 표지 전체의 불투명도(흐리게 열고 닫을 때)
  const openingRef = useRef(opening); // 바뀌어도 진행 중인 애니메이션은 그대로 두고 다음 펼침부터 쓴다
  openingRef.current = opening;
  const [visible, setVisible] = useState(!open);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  const prevOpen = useRef(open);
  const closePending = useRef(false); // 열려 있다가 실제로 덮기 시작했을 때만 true

  useEffect(() => {
    if (!open) setVisible(true);
    const changed = prevOpen.current !== open;
    if (open) closePending.current = false;
    else if (prevOpen.current) closePending.current = true;
    prevOpen.current = open;
    const finish = () => {
      if (open) {
        setVisible(false);
        onOpenedRef.current?.();
      } else if (closePending.current) {
        closePending.current = false;
        onClosedRef.current?.();
      }
    };
    // 처음 그릴 때나 동작 줄이기 설정만 바뀌었을 때는 움직이지 않고 끝 상태로 맞춘다.
    if (!changed) {
      progress.setValue(open ? 1 : 0);
      if (!open) veil.setValue(1);
      finish();
      return;
    }
    // 열린 뒤에는 어느 쪽으로 열었든 progress를 1(화면 밖)로 두어, 다음 덮기가 어디서 시작하든 보이지 않게 한다.
    const crossfade = reduce || (open && openingRef.current === 'fade');
    let anim: Animated.CompositeAnimation;
    if (crossfade) {
      if (!open) {
        veil.setValue(0);
        progress.setValue(0);
      }
      anim = Animated.timing(veil, {
        toValue: open ? 0 : 1,
        duration: reduce ? REDUCED_MS : FADE_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      });
    } else {
      veil.setValue(1);
      anim = Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: DURATION,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    }
    anim.start(({ finished }) => {
      if (!finished) return;
      if (open) progress.setValue(1);
      finish();
    });
    return () => anim.stop();
  }, [open, reduce, progress, veil]);

  if (!visible) return null;
  // 화면 왼쪽 끝이 책등이라 90°를 넘으면 화면 밖이다. 보이는 구간에만 시간을 쓰고 조금 더 돌려 끝을 감춘다.
  const rotateY = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-100deg'] });
  // 넘어갈수록 빛을 덜 받아 어두워진다
  const shade = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });
  // 책으로 놓일 때: 표지가 넘어가는 동안 책상 종이와 속지가 함께 옅어져 뒤의 오늘 화면이 드러난다
  const desk = progress.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: 'clamp' });
  const leaf = (
    <Animated.View
      style={[
        book ? [styles.book, book] : styles.leaf,
        styles.cover,
        { transform: [{ perspective: (book?.width ?? width) * 2.5 }, { rotateY }] },
      ]}
    >
      <Paper texture="cloth" />
      <View style={styles.spine} />
      <View style={styles.frame} />
      <View style={styles.band} />
      <View style={styles.titleBox}>
        <Debossed style={styles.title}>나날</Debossed>
        <View style={styles.rule} />
        <Txt variant="title" style={styles.line}>
          {line}
        </Txt>
        {children}
      </View>
      <Animated.View pointerEvents="none" style={[styles.shade, { opacity: shade }]} />
    </Animated.View>
  );
  return (
    <Animated.View pointerEvents={open ? 'none' : 'auto'} accessibilityViewIsModal={!open} style={[styles.layer, { opacity: veil }]}>
      {book ? (
        <>
          <Animated.View style={[styles.desk, styles.deskPaper, { opacity: desk }]}>
            <Paper />
            <View style={[styles.pages, book]} />
          </Animated.View>
          <View pointerEvents="box-none" style={styles.desk}>
            {leaf}
          </View>
        </>
      ) : (
        leaf
      )}
    </Animated.View>
  );
}

// 천 표지에 눌러 찍은 글자. 글자 아래로 그늘이 지고, 위 가장자리에 빛이 살짝 닿는다.
export function Debossed({ style, children }: { style: StyleProp<TextStyle>; children: string }) {
  return (
    <View>
      <Txt variant="title" accessible={false} importantForAccessibility="no" style={[style, styles.debossLight]}>
        {children}
      </Txt>
      <Txt variant="title" style={[style, styles.deboss]}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  deboss: { textShadowColor: colors.debossShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  debossLight: { position: 'absolute', top: -1, left: 0, right: 0, color: colors.debossLight },
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20 },
  leaf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
  desk: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  deskPaper: { backgroundColor: colors.paper },
  // 가운데 놓인 한 권. 왼쪽 끝(책등)을 축으로 넘어간다
  book: {
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  // 표지 아래 속지 묶음(표지가 넘어가면 잠깐 보인다). 책 그림자도 여기 진다(표지는 overflow: hidden이라 그림자가 잘린다)
  pages: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    backgroundColor: colors.pages,
    borderWidth: 1,
    borderColor: colors.pageEdge,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    transform: [{ translateX: 4 }, { translateY: 3 }],
  },
  cover: { backgroundColor: colors.navy, borderTopRightRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' },
  shade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000' },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.06)',
  },
  frame: {
    position: 'absolute',
    top: 22,
    bottom: 22,
    left: 36,
    right: 22,
    borderWidth: 1,
    borderColor: colors.coverFrame,
    borderRadius: 2,
  },
  band: { position: 'absolute', top: 0, bottom: 0, right: 46, width: 9, backgroundColor: colors.navyDeep },
  titleBox: { position: 'absolute', top: '36%', left: 18, right: 0, alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.title, fontSize: 52, letterSpacing: 8, color: colors.coverText },
  rule: { width: 32, height: 1, backgroundColor: colors.coverRule },
  line: { fontSize: 14, letterSpacing: 3, color: colors.coverSub },
});
