import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../ui/haptics';
import { EASE_OUT } from '../ui/motion';
import { dimPressed } from '../ui/press';
import { colors, fonts } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';
import { BookScene, OPEN_EASE, OPEN_MS, ZOOM_DELAY_MS, ZOOM_EASE, ZOOM_MS } from './onboarding/BookScene';
import { NotePage } from './onboarding/NotePage';
import { NOTE_STEPS, type NoteMode, type NoteStep } from './onboarding/notebook';
import { TURN_EASE, TURN_MS, TURN_REDUCED_MS, TurningSheet } from './onboarding/PageTurn';

const LEAVE_MS = 480; // 마지막 글씨가 흐려지며 사라지는 시간. 끝나면 오늘 화면이 올라온다
const APPEAR_REDUCED_MS = 300; // 동작 줄이기: 표지에서 첫 장으로 흐리게 바뀐다
const SWIPE_MIN = 50; // 이만큼 밀거나 빠르게 튕기면 장을 넘긴다
const LAST = (NOTE_STEPS - 1) as NoteStep;

// cover: 책상 위에 덮인 책, opening: 표지가 넘어가고 오른쪽 장으로 다가감, page: 노트를 넘겨 봄, leaving: 첫 줄 쓰러 감
type Phase = 'cover' | 'opening' | 'page' | 'leaving';
type Turn = { dir: 1 | -1; from: NoteStep; to: NoteStep };

const pageLabel = (step: number) => `${NOTE_STEPS}장 중 ${step + 1}장`;

// 처음 여는 사람에게 책 한 권을 건넨다. 표지를 펼치면 오른쪽 장으로 다가가 그 장이 그대로 첫 노트가 되고,
// 노트가 저절로 써진다. 장을 넘겨(버튼이나 옆으로 밀기) 네 장을 보고 첫 줄을 쓰러 간다.
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReduceMotion();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('cover');
  const [step, setStep] = useState<NoteStep>(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set()); // 한 번 본 장은 다시 써지지 않는다
  const open = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(1)).current; // 노트 장의 불투명도(동작 줄이기에서 표지 → 첫 장)
  const turnP = useRef(new Animated.Value(0)).current;
  const busy = useRef(false); // 펼치거나 넘기는 동안에는 누름을 무시한다
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(
    () => () => {
      anim.current?.stop();
      clearTimeout(leaveTimer.current);
    },
    [],
  );

  const run = (a: Animated.CompositeAnimation, done: () => void) => {
    anim.current = a;
    a.start(({ finished }) => {
      if (anim.current === a) anim.current = null;
      if (finished) done();
    });
  };

  const arrive = () => {
    busy.current = false;
    setPhase('page');
    AccessibilityInfo.announceForAccessibility(pageLabel(0));
  };

  // 표지를 누르면 책등을 축으로 표지가 넘어가고, 책이 반 권 오른쪽으로 옮겨 간 뒤 오른쪽 장으로 다가간다.
  // 동작 줄이기면 표지 그림 위로 첫 장이 흐리게 떠오른다.
  const openBook = () => {
    if (phase !== 'cover' || busy.current) return;
    busy.current = true;
    setPhase('opening');
    if (reduce) {
      appear.setValue(0);
      run(Animated.timing(appear, { toValue: 1, duration: APPEAR_REDUCED_MS, easing: EASE_OUT, useNativeDriver: true }), arrive);
      return;
    }
    appear.setValue(1);
    run(
      Animated.sequence([
        Animated.timing(open, { toValue: 1, duration: OPEN_MS, easing: OPEN_EASE, useNativeDriver: true }),
        Animated.delay(ZOOM_DELAY_MS),
        Animated.timing(zoom, { toValue: 1, duration: ZOOM_MS, easing: ZOOM_EASE, useNativeDriver: true }),
      ]),
      arrive,
    );
  };

  // 앞으로: 아래에 다음 장을 깔아 두고(바로 써지기 시작한다) 지금 장을 왼쪽 모서리를 축으로 넘긴다.
  // 뒤로: 지금 장 위로 앞 장이 넘어와 덮는다.
  const go = (dir: 1 | -1) => {
    if (phase !== 'page' || busy.current) return;
    const to = step + dir;
    if (to < 0 || to > LAST) return;
    busy.current = true;
    const t: Turn = { dir, from: step, to: to as NoteStep };
    turnP.setValue(dir > 0 ? 0 : 1);
    setSeen((prev) => (prev.has(step) ? prev : new Set(prev).add(step)));
    setTurn(t);
    if (dir > 0) setStep(t.to);
    haptic.select();
    run(
      Animated.timing(turnP, {
        toValue: dir > 0 ? 1 : 0,
        duration: reduce ? TURN_REDUCED_MS : TURN_MS,
        easing: reduce ? EASE_OUT : TURN_EASE,
        useNativeDriver: true,
      }),
      () => {
        busy.current = false;
        setTurn(null);
        setStep(t.to);
        AccessibilityInfo.announceForAccessibility(pageLabel(t.to));
      },
    );
  };
  const goRef = useRef(go);
  goRef.current = go;

  // 첫 줄 쓰기·건너뛰기: 지금 장의 글씨가 흐려지며 사라진 뒤 오늘 화면으로 간다(종이는 그대로 이어진다).
  const finish = () => {
    if (phase !== 'page') return;
    // 넘기는 중이면 넘김을 끝난 자리로 마무리한다
    if (turn) {
      anim.current?.stop();
      anim.current = null;
      setTurn(null);
      setStep(turn.to);
    }
    busy.current = true;
    if (reduce) {
      onDoneRef.current();
      return;
    }
    setPhase('leaving');
    leaveTimer.current = setTimeout(() => onDoneRef.current(), LEAVE_MS);
  };

  // 옆으로 밀어 넘기기(버튼이 기본이고 이건 덤이다). 가로로 뚜렷하게 밀 때만 가져간다.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_MIN || g.vx < -0.5) goRef.current(1);
        else if (g.dx > SWIPE_MIN || g.vx > 0.5) goRef.current(-1);
      },
    }),
  ).current;

  const onPage = phase === 'page' || phase === 'leaving' || (phase === 'opening' && reduce);
  const mode: NoteMode = phase === 'leaving' ? 'leave' : seen.has(step) ? 'still' : 'write';
  // 뒤로 넘기는 동안 아래에는 지금 장이 그대로 있다(넘기기 시작할 때 본 장이 되어 다 써진 채로 멈춘다)
  const under: NoteStep = turn && turn.dir < 0 ? turn.from : step;
  const sheetStep: NoteStep | null = turn ? (turn.dir > 0 ? turn.from : turn.to) : null;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      }}
    >
      {size && (phase === 'cover' || phase === 'opening') && (
        <BookScene
          width={size.width}
          height={size.height}
          open={open}
          zoom={zoom}
          reduce={reduce}
          onOpen={openBook}
          canOpen={phase === 'cover'}
        />
      )}

      {size && onPage && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: appear }]} {...pan.panHandlers}>
          <NotePage key={under} step={under} mode={mode} width={size.width} height={size.height} />
          {sheetStep !== null && (
            <TurningSheet key={`${sheetStep}-${turn?.dir}`} progress={turnP} width={size.width} reduce={reduce}>
              <NotePage step={sheetStep} mode="still" width={size.width} height={size.height} />
            </TurningSheet>
          )}
        </Animated.View>
      )}

      {phase === 'page' && (
        <>
          {step < LAST && (
            <Pressable accessibilityRole="button" style={dimPressed(styles.skip)} onPress={finish}>
              <Txt style={styles.skipText}>건너뛰기</Txt>
            </Pressable>
          )}
          <View style={styles.bar}>
            <View style={styles.side}>
              {step > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="이전 장" style={dimPressed(styles.textButton)} onPress={() => go(-1)}>
                  <Txt style={styles.prevText}>‹ 이전 장</Txt>
                </Pressable>
              )}
            </View>
            <Txt accessibilityLabel={pageLabel(step)} style={styles.pageNo}>
              {`— ${step + 1} / ${NOTE_STEPS} —`}
            </Txt>
            <View style={[styles.side, styles.sideEnd]}>
              {step === LAST ? (
                <Pressable accessibilityRole="button" style={dimPressed(styles.primary)} onPress={finish}>
                  <Txt variant="medium" style={styles.primaryText}>
                    첫 줄 쓰기
                  </Txt>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="다음 장" style={dimPressed(styles.textButton)} onPress={() => go(1)}>
                  <Txt variant="medium" style={styles.nextText}>
                    다음 장 ›
                  </Txt>
                </Pressable>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const BAR_H = 104;

const styles = StyleSheet.create({
  // 확대되는 책이 칸 밖(넓은 창의 양옆)으로 비치지 않게 자른다. 바탕은 Main의 종이(책상)가 비친다.
  container: { flex: 1, overflow: 'hidden' },
  skip: { position: 'absolute', top: 4, right: 12, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  skipText: { fontSize: 15, color: colors.muted },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BAR_H,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: { flex: 1, flexDirection: 'row' },
  sideEnd: { justifyContent: 'flex-end' },
  textButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  prevText: { fontSize: 16, color: colors.inkSoft },
  nextText: { fontSize: 16, color: colors.navy },
  pageNo: { fontFamily: fonts.title, fontSize: 14, color: colors.muted, letterSpacing: 2, paddingHorizontal: 8 },
  primary: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    shadowColor: colors.navy,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryText: { fontSize: 16, color: colors.onDark },
});
