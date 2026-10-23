import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { openPrivacy } from '../../lib/links';
import { dimPressed } from '../../ui/press';
import { colors, HIT } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';
import {
  BAR_SHAPE,
  barMax,
  barScale,
  FINAL_T,
  INTRO_COPY,
  INTRO_ROWS,
  INTRO_SPOKEN,
  LOOP_MS,
  resultOpacity,
  ringOpacity,
  ringScale,
  rowOpacity,
  rowRise,
  spokenOpacity,
  typed,
} from '../../voice/intro';

type Props = {
  busy: boolean; // 동의를 저장하는 중
  error: string | null;
  onAgree: () => void;
  onTypeInstead: () => void;
};

const MIC = 44;

// 마이크를 처음 눌렀을 때: 말하면 어떻게 나뉘는지 보여 주고, 같은 자리에서 AI 동의를 받는다(Voice Intro 목업).
// 보기 카드는 보이는 동안 8초마다 되풀이한다. 동작 줄이기면 다 정리된 모습만 멈춰 보여 준다.
export function VoiceIntro({ busy, error, onAgree, onTypeInstead }: Props) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(FINAL_T)).current;
  const [lineW, setLineW] = useState(0); // 받아 적는 글을 가리는 막이 비켜날 거리

  useEffect(() => {
    if (reduce) {
      t.stopAnimation();
      t.setValue(FINAL_T);
      return;
    }
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, t]);

  const coverX = t.interpolate({ inputRange: typed.inputRange, outputRange: typed.outputRange.map((v) => v * lineW) });

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.head}>
        <Txt variant="hand" style={styles.hand}>
          {INTRO_COPY.hand}
        </Txt>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          {INTRO_COPY.title}
        </Txt>
      </View>

      <View style={styles.card} accessible accessibilityLabel={`보기: ${INTRO_SPOKEN}라고 말하면 ${INTRO_ROWS.map((r) => `${r.text} ${r.when}`).join(', ')}로 나눠 줘요`}>
        <View style={styles.micRow}>
          <View style={styles.micWrap}>
            <Animated.View pointerEvents="none" style={[styles.ring, { opacity: t.interpolate(ringOpacity), transform: [{ scale: t.interpolate(ringScale) }] }]} />
            <View style={styles.mic}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Rect x={9} y={3} width={6} height={11} rx={3} stroke={colors.onDark} strokeWidth={1.8} />
                <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={colors.onDark} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            </View>
          </View>
          <View style={styles.bars}>
            {BAR_SHAPE.map((_, i) => (
              <Animated.View key={i} style={[styles.bar, { height: barMax(i), transform: [{ scaleY: t.interpolate(barScale(i)) }] }]} />
            ))}
          </View>
        </View>

        <Animated.View style={[styles.spoken, { opacity: t.interpolate(spokenOpacity) }]} onLayout={(e) => setLineW(e.nativeEvent.layout.width)}>
          <Txt variant="hand" style={styles.say} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {INTRO_SPOKEN}
          </Txt>
          {/* 글 위를 카드 색 막이 덮고 있다가 오른쪽으로 비켜나며 한 글자씩 드러낸다 */}
          <Animated.View pointerEvents="none" style={[styles.cover, { transform: [{ translateX: coverX }] }]} />
        </Animated.View>

        <Animated.View style={[styles.result, { opacity: t.interpolate(resultOpacity) }]}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M12 4v16M6 14l6 6 6-6" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Txt style={styles.resultText}>{INTRO_COPY.result}</Txt>
        </Animated.View>

        <View style={styles.rows}>
          {INTRO_ROWS.map((r, i) => (
            <Animated.View key={r.text} style={[styles.row, { opacity: t.interpolate(rowOpacity(i)), transform: [{ translateY: t.interpolate(rowRise(i)) }] }]}>
              <View style={styles.dot} />
              <Txt style={styles.rowText} numberOfLines={1}>
                {r.text}
              </Txt>
              <View style={styles.chip}>
                <Txt variant="medium" style={styles.chipText}>
                  {r.when}
                </Txt>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>

      <Txt style={styles.disclosure}>{INTRO_COPY.disclosure}</Txt>
      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          style={dimPressed(styles.primary)}
          onPress={onAgree}
        >
          {busy ? <ActivityIndicator color={colors.onDark} accessibilityLabel="저장하는 중" /> : <Txt variant="medium" style={styles.primaryText}>{INTRO_COPY.agree}</Txt>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={dimPressed(styles.secondary)} onPress={onTypeInstead}>
          <Txt style={styles.secondaryText}>{INTRO_COPY.type}</Txt>
        </Pressable>
        <View style={styles.foot}>
          <Txt style={styles.footText}>{INTRO_COPY.once} · </Txt>
          <Pressable accessibilityRole="link" style={dimPressed(styles.link)} onPress={openPrivacy}>
            <Txt style={[styles.footText, styles.underline]}>개인정보 처리방침</Txt>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, gap: 16, paddingBottom: 8 },
  head: { gap: 6, marginTop: 4 },
  hand: { color: colors.noteRed },
  title: { fontSize: 24, lineHeight: 32 },
  card: { backgroundColor: colors.popover, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, padding: 18, gap: 14 },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  micWrap: { width: MIC, height: MIC },
  ring: { position: 'absolute', top: 0, left: 0, width: MIC, height: MIC, borderRadius: MIC / 2, backgroundColor: colors.navy },
  mic: { width: MIC, height: MIC, borderRadius: MIC / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 48 },
  bar: { width: 5, borderRadius: 3, backgroundColor: colors.navy },
  spoken: { overflow: 'hidden', minHeight: 26, justifyContent: 'center' },
  say: { fontSize: 21, lineHeight: 26, color: colors.inkSoft },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.popover },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { fontSize: 13, color: colors.muted },
  rows: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.ink },
  rowText: { flex: 1, fontSize: 16 },
  chip: { borderWidth: 1, borderColor: colors.navy, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  chipText: { fontSize: 12, lineHeight: 17, color: colors.navy },
  disclosure: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  error: { color: colors.danger, fontSize: 14 },
  actions: { gap: 8, marginTop: 'auto' },
  primary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: colors.onDark, fontSize: 17 },
  secondary: { minHeight: HIT, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, color: colors.inkSoft },
  foot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  footText: { fontSize: 13, color: colors.inkSoft },
  link: { minHeight: HIT, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
