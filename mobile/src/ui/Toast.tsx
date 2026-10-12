import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { EASE_OUT } from './motion';
import { dimPressed } from './press';
import { colors } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

export type ToastSpec = {
  key: number; // 바뀌면 새 토스트로 보고 시간을 다시 잰다
  message: string;
  action?: { label: string; onPress: () => void };
};

const SHOW_MS = 4000;
const SHOW_MS_READER = 8000; // 스크린 리더는 문구를 다 읽고 동작까지 찾아갈 시간이 더 필요하다

// 화면 아래에 잠깐 떴다 사라지는 한 줄. 앱 화면은 키보드만큼 줄어 있으니(KeyboardResize) 아래에 붙이면 키보드 위에 뜬다.
// onHide는 사라진 토스트의 key를 받는다(그 사이 새 토스트가 떴으면 그것까지 지우지 않게).
export function Toast({ toast, onHide }: { toast: ToastSpec | null; onHide: (key: number) => void }) {
  if (!toast) return null;
  return <ToastBody key={toast.key} toast={toast} onHide={onHide} />;
}

function ToastBody({ toast, onHide }: { toast: ToastSpec; onHide: (key: number) => void }) {
  const reduce = useReduceMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const gone = useRef(false);

  const hide = () => {
    if (gone.current) return;
    gone.current = true;
    Animated.timing(appear, { toValue: 0, duration: 150, easing: EASE_OUT, useNativeDriver: true }).start(() => onHide(toast.key));
  };

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start();
    // iOS는 accessibilityLiveRegion을 모르니 직접 읽어 준다
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(toast.action ? `${toast.message}. ${toast.action.label}` : toast.message);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((reader) => {
        if (alive) timer = setTimeout(hide, reader ? SHOW_MS_READER : SHOW_MS);
      });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // 토스트 하나에 한 번만(새 토스트는 key가 바뀌어 새로 마운트된다)
  }, []);

  // 동작 줄이기면 아래에서 올라오지 않고 흐려지기만 한다
  const translateY = reduce ? 0 : appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View accessibilityLiveRegion="polite" style={[styles.toast, { opacity: appear, transform: [{ translateY }] }]}>
      <Txt style={styles.message}>{toast.message}</Txt>
      {toast.action && (
        <Pressable
          accessibilityRole="button"
          hitSlop={{ top: 4, bottom: 4 }}
          style={dimPressed(styles.action)}
          onPress={() => {
            toast.action?.onPress();
            hide();
          }}
        >
          <Txt variant="medium" style={styles.actionText}>
            {toast.action.label}
          </Txt>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: 10,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  message: { flex: 1, fontSize: 15, color: colors.onDark },
  action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  actionText: { fontSize: 15, color: colors.onDark, textDecorationLine: 'underline' },
});
