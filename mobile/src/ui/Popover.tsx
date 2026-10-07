import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from './theme';

export type Anchor = { x: number; y: number; width: number; height: number };

// 버튼 위치를 재서 그 아래에 팝오버를 띄운다.
export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = useCallback(() => {
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
  if (!anchor) return null;
  const left =
    align === 'left'
      ? Math.max(12, Math.min(anchor.x - 4, screen.width - width - 12))
      : Math.max(12, anchor.x + anchor.width - width + 6);
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[styles.box, { top: anchor.y + anchor.height + 4, left, width }]}
      >
        {children}
      </View>
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
