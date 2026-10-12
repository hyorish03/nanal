import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { useReduceMotion } from './useReduceMotion';

export type Anchor = { x: number; y: number; width: number; height: number };

// 버튼 위치를 재서 그 아래에 팝오버를 띄운다.
export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = useCallback(() => {
    // 입력칸 포커스를 먼저 푼다. 그대로 두면 팝오버(Modal)가 닫힐 때 iOS가 포커스를 되돌려 키보드가 다시 뜬다.
    Keyboard.dismiss();
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { ref, anchor, open, close };
}

type Props = {
  anchor: Anchor | null;
  align: 'left' | 'right'; // 버튼 왼쪽 끝 또는 오른쪽 끝에 맞춘다
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function Popover({ anchor, align, width, label, onClose, children }: Props) {
  const screen = useWindowDimensions();
  const reduce = useReduceMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const shown = anchor !== null;

  // 버튼 쪽 모서리에서 살짝 커지며 나타난다. 닫을 때는 바로 사라진다(뒤이은 Alert은 따로 창을 띄우니 기다릴 필요가 없다).
  useEffect(() => {
    if (!shown) return;
    const anim = Animated.timing(appear, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => {
      anim.stop();
      appear.setValue(0); // 다음에 열 때 첫 프레임부터 투명하게
    };
  }, [shown, appear]);

  if (!anchor) return null;
  const left =
    align === 'left'
      ? Math.max(12, Math.min(anchor.x - 4, screen.width - width - 12))
      : Math.max(12, anchor.x + anchor.width - width + 6);
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[
          styles.box,
          {
            top: anchor.y + anchor.height + 4,
            left,
            width,
            opacity: appear,
            transformOrigin: align === 'right' ? 'top right' : 'top left',
            transform: reduce ? [] : [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    padding: 4,
    backgroundColor: colors.popover,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
});
