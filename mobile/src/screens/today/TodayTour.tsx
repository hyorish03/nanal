import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Keyboard, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  bubbleFrame,
  lerpRect,
  placeBubble,
  SPOT_RADIUS,
  spotFor,
  spotPath,
  type TourRect,
  type TourStep,
  type TourStepId,
  type TourTargets,
  tourSteps,
  usableRect,
} from '../../lib/todayTour';
import { haptic } from '../../ui/haptics';
import { EASE_IN_OUT } from '../../ui/motion';
import { dimPressed } from '../../ui/press';
import { colors, fonts, SLIM_H, SLIM_SLOP } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';

type Ref = RefObject<View | null>;
// 단계마다 가리킬 것. 줄(symbol·swipe)은 목록 칸(page) 안에 보일 때만 쓴다
export type TourRefs = { page: Ref; composer: Ref; capture: Ref; symbol: Ref; swipe: Ref; archive: Ref };

type Props = {
  active: boolean; // 띄워도 되는 때(시트·월초 정리·위젯 동작이 없다). 꺼지면 숨기고, 다시 켜지면 그 단계부터
  refs: TourRefs;
  voice: boolean;
  empty: boolean; // 오늘 적은 줄이 없다: 기호·밀기는 빈 자리를 가리킨다
  sidebar: boolean; // 지난 기록이 책갈피 끈이 아니라 사이드바에 있다
  onDone: () => void; // 끝까지 봤거나 건너뛰었다(다시 띄우지 않는다)
};

const SETTLE_MS = 450; // 오늘 장이 올라오고 목록이 자리 잡은 뒤에 잰다
const MOVE_MS = 380;
const PULSE_MS = 800;
const DIM = 'rgba(30, 24, 18, 0.55)';
const RING_OUT = 4; // 구멍 바깥으로 띄운 고리

function measure(ref: Ref): Promise<TourRect | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    try {
      node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    } catch {
      resolve(null);
    }
  });
}

// 오늘 장 위를 어둡게 덮고 가리킨 곳만 둥글게 비춘다. 어두운 곳을 눌러도 아무 일도 없다(실수로 건너뛰지 않게).
export function TodayTour({ active, refs, voice, empty, sidebar, onDone }: Props) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [steps, setSteps] = useState<TourStep[] | null>(null); // 처음 잰 단계 목록(뒤에 다시 재도 단계 수는 그대로)
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<TourRect | null>(null); // 지금 그린 구멍(움직이는 중이면 그 사이)
  const [bubbleH, setBubbleH] = useState(0);
  const spotRef = useRef<TourRect | null>(null);
  const move = useRef(new Animated.Value(1)).current;
  const bubbleY = useRef(new Animated.Value(0)).current;
  const bubbleX = useRef(new Animated.Value(0)).current;
  const placed = useRef(false); // 말풍선을 한 번 놓았다(처음은 움직이지 않고 그 자리에)
  const pulse = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false); // 끝냈다(부모가 내릴 때까지 다시 그리지 않는다)

  const measureAll = useCallback(async (): Promise<TourTargets> => {
    const [page, composer, capture, symbol, swipe, archive] = await Promise.all(
      [refs.page, refs.composer, refs.capture, refs.symbol, refs.swipe, refs.archive].map(measure),
    );
    const screen = { x: 0, y: 0, width: win.width, height: win.height };
    const list = usableRect(page, screen) ?? screen;
    return {
      composer: usableRect(composer, screen),
      capture: usableRect(capture, screen),
      symbol: usableRect(symbol, list),
      swipe: usableRect(swipe, list),
      archive: usableRect(archive, screen),
    };
  }, [refs, win.width, win.height]);

  // 처음 켜질 때 한 번 재서 단계를 정한다. 가리킬 것이 하나도 없으면 바로 끝낸다
  useEffect(() => {
    if (!active || steps) return;
    let alive = true;
    Keyboard.dismiss();
    const t = setTimeout(() => {
      void measureAll().then((targets) => {
        if (!alive) return;
        const list = tourSteps(targets, { voice, empty, sidebar });
        if (list.length === 0) {
          setDone(true);
          onDone();
          return;
        }
        setSteps(list);
      });
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // onDone은 매 렌더 새 함수라 뺀다
  }, [active, steps, measureAll, voice, empty, sidebar]);

  // 창 크기가 바뀌면(회전, 키보드, 사이드바) 다시 잰다. 이번에 못 잰 자리는 전에 잰 자리를 그대로 쓴다
  const remeasure = useCallback(() => {
    void measureAll().then((targets) => {
      setSteps((prev) => prev && prev.map((s) => ({ ...s, rect: targets[s.id as TourStepId] ?? s.rect })));
    });
  }, [measureAll]);
  const shown = active && steps !== null && !done;
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(remeasure, 120);
    const sub = Keyboard.addListener('keyboardDidHide', remeasure);
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [shown, win.width, win.height, remeasure]);

  const step = steps?.[index] ?? null;
  const target = step ? spotFor(step.rect, win, insets.top) : null;

  // 구멍을 새 자리로 옮긴다. 동작 줄이기면 바로 바꾼다
  useEffect(() => {
    if (!target) return;
    const from = spotRef.current;
    move.stopAnimation();
    const same = from && from.x === target.x && from.y === target.y && from.width === target.width && from.height === target.height;
    if (!from || reduce || same) {
      spotRef.current = target;
      setSpot(target);
      return;
    }
    move.setValue(0);
    const id = move.addListener(({ value }) => {
      const r = lerpRect(from, target, value);
      spotRef.current = r;
      setSpot(r);
    });
    // 마지막 값(1)도 listener가 받는다. 도중에 다음 단계로 가면 그때 자리에서 이어 간다
    Animated.timing(move, { toValue: 1, duration: MOVE_MS, easing: EASE_IN_OUT, useNativeDriver: false }).start();
    return () => move.removeListener(id);
  }, [target?.x, target?.y, target?.width, target?.height, reduce]);

  // 말풍선 자리(높이를 잰 뒤에 위·아래를 정한다)
  const frame = target ? bubbleFrame(target, win.width) : { left: 20, width: win.width - 40 };
  const place = target ? placeBubble({ spot: target, bubbleH, windowH: win.height, insetTop: insets.top, insetBottom: insets.bottom }) : null;
  useEffect(() => {
    if (!place || bubbleH === 0) return;
    if (!placed.current || reduce) {
      placed.current = true;
      bubbleY.setValue(place.top);
      bubbleX.setValue(frame.left);
      return;
    }
    Animated.parallel([
      Animated.timing(bubbleY, { toValue: place.top, duration: MOVE_MS, easing: EASE_IN_OUT, useNativeDriver: true }),
      Animated.timing(bubbleX, { toValue: frame.left, duration: MOVE_MS, easing: EASE_IN_OUT, useNativeDriver: true }),
    ]).start();
  }, [place?.top, frame.left, bubbleH, reduce]);

  // 고리는 숨 쉬듯 옅어졌다 돌아온다. 동작 줄이기면 가만히
  useEffect(() => {
    if (!shown || reduce) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, easing: EASE_IN_OUT, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: PULSE_MS, easing: EASE_IN_OUT, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shown, reduce, pulse]);

  // 단계가 바뀔 때마다 스크린 리더가 말풍선을 읽는다
  const total = steps?.length ?? 0;
  useEffect(() => {
    if (!shown || !step) return;
    const t = setTimeout(
      () => AccessibilityInfo.announceForAccessibility(`${total}단계 중 ${index + 1}단계. ${step.title}. ${step.spoken ?? step.body}`),
      300,
    );
    return () => clearTimeout(t);
  }, [shown, index, step?.id]);

  const finish = () => {
    if (done) return;
    setDone(true);
    onDone();
  };
  const last = index >= total - 1;
  const next = () => {
    if (last) return finish();
    haptic.select();
    setIndex((i) => Math.min(i + 1, total - 1));
  };

  if (!shown || !step) return null;
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent supportedOrientations={ORIENTATIONS} onRequestClose={finish}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={finish}>
        {spot && (
          <>
            <Svg width={win.width} height={win.height} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path d={spotPath(win, spot)} fill={DIM} fillRule="evenodd" />
            </Svg>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  left: spot.x - RING_OUT,
                  top: spot.y - RING_OUT,
                  width: spot.width + RING_OUT * 2,
                  height: spot.height + RING_OUT * 2,
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
          </>
        )}
        <Animated.View
          style={[styles.bubble, { width: frame.width, opacity: bubbleH === 0 ? 0 : 1, transform: [{ translateX: bubbleX }, { translateY: bubbleY }] }]}
          onLayout={(e) => setBubbleH(Math.round(e.nativeEvent.layout.height))}
        >
          <View
            accessible
            accessibilityLabel={`${total}단계 중 ${index + 1}단계. ${step.title}. ${step.spoken ?? step.body}`}
            accessibilityLiveRegion="polite"
            style={styles.text}
          >
            <Txt variant="label" style={styles.count}>
              {index + 1} / {total}
            </Txt>
            <Txt variant="title" style={styles.title}>
              {step.title}
            </Txt>
            <Txt style={styles.body}>{step.body}</Txt>
          </View>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" style={dimPressed(styles.skip)} onPress={finish}>
              <Txt style={styles.skipText}>건너뛰기</Txt>
            </Pressable>
            <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
              {steps!.map((s, i) => (
                <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
            <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed(styles.next)} onPress={next}>
              <Txt variant="medium" style={styles.nextText}>
                {last ? '시작하기' : '다음'}
              </Txt>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ORIENTATIONS: ('portrait' | 'portrait-upside-down' | 'landscape' | 'landscape-left' | 'landscape-right')[] = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
];

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderRadius: SPOT_RADIUS + RING_OUT, borderWidth: 2, borderColor: colors.highlight },
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: { gap: 8 },
  count: { fontSize: 13, color: colors.noteRed },
  // 고운바탕 굵은 글꼴은 앱에 넣지 않았다(보통 굵기로)
  title: { fontFamily: fonts.title, fontSize: 19, lineHeight: 27, color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.inkSoft },
  // 글자를 키우면 버튼이 다음 줄로 내려간다
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 4 },
  skip: { minHeight: 44, minWidth: 44, paddingHorizontal: 4, justifyContent: 'center' },
  skipText: { fontSize: 15, color: colors.inkSoft },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dotOff },
  dotOn: { width: 16, backgroundColor: colors.navy },
  next: { minHeight: SLIM_H, minWidth: 44, paddingHorizontal: 16, borderRadius: SLIM_H / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 15, color: colors.onDark },
});
