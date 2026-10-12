import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '../ui/BookCover';
import { Highlight } from '../ui/Highlight';
import { Inkwell } from '../ui/Inkwell';
import { EASE_OUT } from '../ui/motion';
import { StatusSymbol } from '../ui/StatusSymbol';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { useReduceMotion } from '../ui/useReduceMotion';
import { dimPressed } from '../ui/press';

const STEPS = 4;
const BOOK_W = 164;

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const reduce = useReduceMotion();
  const book = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const moving = useRef(false); // 단계가 바뀌거나 표지를 넘기는 동안에는 누름을 무시한다

  useEffect(
    () => () => {
      book.stopAnimation();
      fade.stopAnimation();
      slide.stopAnimation();
    },
    [book, fade, slide],
  );

  // 단계가 바뀔 때 본문을 흐렸다가, 새 단계를 가는 쪽에서 살짝 밀어 넣는다(동작 줄이기면 흐리기만).
  const goTo = (target: number) => {
    if (moving.current) return;
    moving.current = true;
    const from = reduce ? 0 : target > step ? 12 : -12;
    Animated.timing(fade, { toValue: 0, duration: 120, easing: EASE_OUT, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) {
        moving.current = false;
        return;
      }
      setStep(target);
      book.setValue(0);
      slide.setValue(from);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: reduce ? 200 : 240, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 240, easing: EASE_OUT, useNativeDriver: true }),
      ]).start(() => {
        moving.current = false;
      });
    });
  };

  // 첫 단계의 "시작하기"는 작은 다이어리의 표지를 책등 쪽으로 넘겨 펼친 뒤 다음 단계로 간다.
  // 동작 줄이기면 표지는 넘기지 않고 다음 단계로 흐려지며 바뀐다.
  const next = () => {
    if (step > 0 || reduce) {
      goTo(Math.min(step + 1, STEPS - 1));
      return;
    }
    if (moving.current) return;
    moving.current = true;
    Animated.timing(book, {
      toValue: 1,
      duration: 900,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      moving.current = false;
      if (finished) goTo(1);
    });
  };
  // 표지가 왼쪽으로 넘어가면 펼친 두 쪽이 가운데 오도록 책을 오른쪽으로 반 권 옮긴다.
  const shift = book.interpolate({ inputRange: [0, 1], outputRange: [0, BOOK_W / 2] });

  return (
    <View style={styles.container}>
      <Paper />
      <View style={styles.top}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`${STEPS}단계 중 ${step + 1}단계`} style={styles.dots}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" style={dimPressed(styles.skip)} onPress={onDone}>
          <Txt style={styles.skipText}>건너뛰기</Txt>
        </Pressable>
      </View>

      <Animated.View style={[styles.flex, { opacity: fade, transform: [{ translateX: slide }] }]}>
      <ScrollView contentContainerStyle={styles.body}>
        {step === 0 && (
          <View style={styles.centered}>
            <Animated.View style={[styles.book, { transform: [{ translateX: shift }, { rotate: '-4deg' }] }]}>
              <BookCover width={BOOK_W} height={216} titleSize={28} open={book} />
            </Animated.View>
            <View style={styles.copy}>
              <Txt variant="title" accessibilityRole="header" style={styles.h1}>
                {'할 일은 놓치지 않게,\n마음은 차곡차곡.'}
              </Txt>
              <Txt style={styles.lead}>하루를 한 줄씩 적는 다이어리예요. 아침엔 할 일을 정하고, 저녁엔 오늘의 마음을 남겨요.</Txt>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.section}>
            <Txt variant="title" accessibilityRole="header" style={styles.h2}>
              기호 두 개면 충분해요
            </Txt>
            <View style={styles.card}>
              <View style={styles.badge}>
                <Txt style={styles.badgeText}>•</Txt>
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">할 일</Txt>
                <Txt style={styles.small}>보고서 초안 마무리 · 15:00 팀 회의</Txt>
              </View>
            </View>
            <View style={styles.card}>
              <View style={styles.badge}>
                <Txt style={styles.badgeText}>–</Txt>
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">메모</Txt>
                <Txt variant="hand" style={styles.handSmall}>
                  비 오는 날 창가 자리가 좋았다
                </Txt>
              </View>
            </View>
            <View style={styles.dashedTop}>
              <Txt style={styles.small}>할 일은 이렇게 바뀌어요</Txt>
              <View style={styles.flow}>
                <StatusSymbol kind="open" size={16} />
                <Txt style={styles.flowText}>할 일</Txt>
                <Txt style={styles.arrow}>→</Txt>
                <StatusSymbol kind="doing" size={16} />
                <Txt style={styles.flowText}>진행 중</Txt>
                <Txt style={styles.arrow}>→</Txt>
                <StatusSymbol kind="done" size={16} />
                <Txt style={styles.flowText}>끝냄</Txt>
              </View>
              <Txt style={styles.note}>기호를 누를 때마다 다음 단계로 바뀌어요.</Txt>
              <View style={styles.wrapRow}>
                <View style={styles.inline}>
                  <Highlight on>
                    <Txt>형광펜</Txt>
                  </Highlight>
                  <Txt>중요한 일 (하루 3개)</Txt>
                </View>
                <View style={styles.inline}>
                  <StatusSymbol kind="migrated" size={16} />
                  <Txt>다른 날로 옮김</Txt>
                </View>
                <View style={styles.inline}>
                  <Txt style={styles.muted}>×</Txt>
                  <Txt style={styles.muted}>지우기</Txt>
                </View>
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Txt variant="title" accessibilityRole="header" style={styles.h2}>
              하루는 이렇게 흘러가요
            </Txt>
            <View style={styles.flowItem}>
              <View style={styles.flowIcon}>
                <View style={styles.postit} />
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">아침</Txt>
                <Txt style={styles.small}>어제에서 넘어온 일을 오늘 할지, 내일로 미룰지, 지울지 골라요.</Txt>
              </View>
            </View>
            <View style={styles.flowItem}>
              <View style={styles.flowIcon}>
                <View style={styles.dotPaper} />
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">낮</Txt>
                <Txt style={styles.small}>떠오를 때마다 할 일이나 메모로 한 줄씩 적어요.</Txt>
              </View>
            </View>
            <View style={styles.flowItem}>
              <View style={styles.flowIcon}>
                <Inkwell id="onboarding-well" mood={4} size="large" paper={colors.paper} />
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">저녁</Txt>
                <Txt style={styles.small}>잉크병에 오늘 기분을 담고, 원하면 짧게 돌아봐요.</Txt>
              </View>
            </View>
            <View style={styles.tip}>
              <Txt variant="hand">기호가 헷갈리면 (i)를 눌러요</Txt>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.centered}>
            <View accessible={false} style={styles.stamp}>
              <Txt variant="title" style={styles.stampSmall}>
                기록한 날
              </Txt>
              <Txt variant="title" style={styles.stampBig}>
                1
              </Txt>
              <Txt variant="title" style={styles.stampSmall}>
                일째
              </Txt>
            </View>
            <View style={styles.copy}>
              <Txt variant="title" accessibilityRole="header" style={styles.h1}>
                {'오늘의 첫 줄을\n적어볼까요?'}
              </Txt>
              <Txt style={styles.lead}>며칠 쉬어도 괜찮아요. 쌓인 날은 줄어들지 않아요.</Txt>
              <Txt style={styles.note}>기호 설명은 오늘 화면의 (i)에서 언제든 다시 볼 수 있어요.</Txt>
            </View>
          </View>
        )}
      </ScrollView>
      </Animated.View>

      <View style={styles.actions}>
        {step > 0 && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.back)} onPress={() => goTo(step - 1)}>
            <Txt>이전</Txt>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" style={dimPressed(styles.primary)} onPress={step === STEPS - 1 ? onDone : next}>
          <Txt variant="medium" style={styles.primaryText}>
            {step === 0 ? '시작하기' : step === STEPS - 1 ? '첫 줄 쓰기' : '다음'}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 24, gap: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dotOff },
  dotOn: { width: 22, backgroundColor: colors.ink },
  skip: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  skipText: { fontSize: 14, color: colors.inkSoft },
  body: { flexGrow: 1 },
  flex: { flex: 1 },
  centered: { flexGrow: 1, justifyContent: 'center', gap: 28 },
  book: { alignSelf: 'center' },
  copy: { gap: 12 },
  h1: { fontSize: 28, lineHeight: 38 },
  h2: { fontSize: 26, lineHeight: 35 },
  lead: { fontSize: 16, lineHeight: 26, color: colors.inkSoft },
  section: { gap: 16 },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 10,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 22 },
  cardText: { flex: 1, gap: 2 },
  small: { fontSize: 14, lineHeight: 22, color: colors.inkSoft },
  handSmall: { fontSize: 21 },
  dashedTop: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flowText: { fontSize: 15 },
  arrow: { color: colors.faint },
  note: { fontSize: 13, color: colors.muted },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { color: colors.inkSoft },
  flowItem: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  flowIcon: { width: 48, alignItems: 'center' }, // 그림 너비가 달라도 글이 한 줄로 맞는다
  postit: { width: 44, height: 40, backgroundColor: colors.postit, transform: [{ rotate: '-4deg' }] },
  dotPaper: { width: 44, height: 40, borderRadius: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft },
  tip: { padding: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.navy, borderRadius: 12 },
  stamp: {
    alignSelf: 'center',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1.5,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  stampSmall: { fontSize: 14, color: colors.navy },
  stampBig: { fontSize: 38, lineHeight: 44, color: colors.navy },
  actions: { flexDirection: 'row', gap: 10 },
  back: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.ink,
    justifyContent: 'center',
  },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark },
});
