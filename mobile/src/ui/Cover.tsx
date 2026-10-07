import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, fonts } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

type Props = {
  open: boolean; // true면 펼쳐져 사라지고, false면 덮인다
  line: string; // 표지 아래 문구
  onClosed?: () => void; // 덮기가 끝났을 때
  children?: ReactNode; // 덮인 표지 위에 올릴 버튼 등
};

const DURATION = 950;

export function Cover({ open, line, onClosed, children }: Props) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [visible, setVisible] = useState(!open);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (!open) setVisible(true);
    const finish = () => {
      if (open) setVisible(false);
      else onClosedRef.current?.();
    };
    if (reduce) {
      progress.setValue(open ? 1 : 0);
      finish();
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      easing: Easing.bezier(0.32, 0.72, 0.2, 1),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) finish();
    });
    return () => anim.stop();
  }, [open, reduce, progress]);

  if (!visible) return null;
  const rotateY = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-172deg'] });
  return (
    <Animated.View
      pointerEvents={open ? 'none' : 'auto'}
      accessibilityViewIsModal={!open}
      style={[styles.cover, { transform: [{ perspective: 1800 }, { rotateY }] }]}
    >
      <View style={styles.spine} />
      <View style={styles.frame} />
      <View style={styles.band} />
      <View style={styles.titleBox}>
        <Txt variant="title" style={styles.title}>
          나날
        </Txt>
        <View style={styles.rule} />
        <Txt variant="title" style={styles.line}>
          {line}
        </Txt>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.navy,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
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
    borderColor: 'rgba(233, 223, 200, 0.45)',
    borderRadius: 2,
  },
  band: { position: 'absolute', top: 0, bottom: 0, right: 46, width: 9, backgroundColor: colors.navyDeep },
  titleBox: { position: 'absolute', top: '36%', left: 18, right: 0, alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.title, fontSize: 52, letterSpacing: 8, color: colors.coverText },
  rule: { width: 32, height: 1, backgroundColor: 'rgba(233, 223, 200, 0.7)' },
  line: { fontSize: 14, letterSpacing: 3, color: 'rgba(233, 223, 200, 0.85)' },
});
