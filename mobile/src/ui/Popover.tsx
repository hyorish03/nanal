import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, type EmitterSubscription, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from './motion';
import { colors } from './theme';
import { useReduceMotion } from './useReduceMotion';

export type Anchor = { x: number; y: number; width: number; height: number };

// 버튼 위치를 재서 그 아래(자리가 모자라면 위)에 팝오버를 띄운다.
export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const isOpen = useRef(false);
  const afterKeyboard = useRef<EmitterSubscription | null>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (isOpen.current) setAnchor({ x, y, width, height });
    });
  }, []);
  const open = useCallback(() => {
    isOpen.current = true;
    const keyboardUp = Keyboard.isVisible();
    // 입력칸 포커스를 먼저 푼다. 그대로 두면 팝오버(Modal)가 닫힐 때 iOS가 포커스를 되돌려 키보드가 다시 뜬다.
    Keyboard.dismiss();
    measure();
    // 키보드가 내려가며 화면 높이가 돌아오면 버튼이 움직일 수 있어, 다 내려간 뒤 한 번 더 잰다
    if (keyboardUp) {
      afterKeyboard.current?.remove();
      afterKeyboard.current = Keyboard.addListener('keyboardDidHide', () => {
        afterKeyboard.current?.remove();
        afterKeyboard.current = null;
        measure();
      });
    }
  }, [measure]);
  const close = useCallback(() => {
    isOpen.current = false;
    afterKeyboard.current?.remove();
    afterKeyboard.current = null;
    setAnchor(null);
  }, []);
  useEffect(() => () => afterKeyboard.current?.remove(), []);
  return { ref, anchor, open, close };
}

type Props = {
  anchor: Anchor | null;
  align: 'left' | 'right'; // 버튼 왼쪽 끝 또는 오른쪽 끝에 맞춘다
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode; // 스크롤 밖 아래에 늘 보이는 줄(닫기 버튼 등)
};

// 열렸을 때만 안쪽을 그린다. 닫힌 팝오버(목록 줄마다 하나씩)가 창 크기·동작 줄이기 구독을 들고 있지 않게.
export function Popover(props: Props) {
  if (!props.anchor) return null;
  return <OpenPopover {...props} anchor={props.anchor} />;
}

const GAP = 4; // 버튼과 팝오버 사이
const EDGE = 8; // 화면 위아래 안전 여백에서 더 띄우는 거리
const CHROME = 10; // 상자의 안쪽 여백(4×2)과 테두리(1×2)

function OpenPopover({ anchor, align, width, label, onClose, children, footer }: Props & { anchor: Anchor }) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState<number | null>(null); // 처음 잰 높이. 재기 전에는 투명하다
  const [footerH, setFooterH] = useState(0);

  // 버튼 쪽 모서리에서 살짝 커지며 나타난다. 닫을 때는 바로 사라진다(뒤이은 Alert은 따로 창을 띄우니 기다릴 필요가 없다).
  const measured = height !== null;
  useEffect(() => {
    if (!measured) return;
    const anim = Animated.timing(appear, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [measured, appear]);

  const belowTop = anchor.y + anchor.height + GAP;
  const spaceBelow = screen.height - insets.bottom - EDGE - belowTop;
  const spaceAbove = anchor.y - GAP - insets.top - EDGE;
  // 아래에 다 들어가지 않고 위가 더 넓으면 버튼 위로 뒤집는다. 어느 쪽이든 넘치면 안에서 스크롤한다
  const above = measured && height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(80, !measured ? Math.max(spaceBelow, spaceAbove) : above ? spaceAbove : spaceBelow);
  const top = above ? anchor.y - GAP - Math.min(height, maxHeight) : belowTop;
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
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeight((prev) => prev ?? h);
        }}
        style={[
          styles.box,
          {
            top,
            left,
            width,
            opacity: appear,
            transformOrigin: `${above ? 'bottom' : 'top'} ${align}`,
            transform: reduce ? [] : [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          },
        ]}
      >
        <ScrollView style={{ maxHeight: maxHeight - CHROME - footerH }} alwaysBounceVertical={false}>
          {children}
        </ScrollView>
        {footer && <View onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>{footer}</View>}
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
    borderColor: '#DCD1BE',
    borderRadius: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
});
