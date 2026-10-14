import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE_OUT } from './motion';
import { dimPressed } from './press';
import { colors, HIT } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

type Props = { visible: boolean; email: string | null; onClose: () => void; onSignOut: () => void; onDeleteAccount: () => void };

// 오늘 화면 계정 버튼을 누르면 아래에서 올라오는 작은 종이 시트: 이 노트의 주인(이메일)과 로그아웃
export function AccountSheet({ visible, email, onClose, onSignOut, onDeleteAccount }: Props) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const show = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(show, { toValue: visible ? 1 : 0, duration: reduce ? 0 : visible ? 260 : 180, easing: EASE_OUT, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !visible) setMounted(false);
      },
    );
  }, [visible, reduce, show]);

  const lift = show.interpolate({ inputRange: [0, 1], outputRange: [280, 0] });
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: show }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY: lift }] }]}
      >
        <View style={styles.handle} />
        <Txt variant="hand" accessibilityRole="header">
          이 노트의 주인
        </Txt>
        <Txt style={styles.email} numberOfLines={1}>
          {email ?? '로그인한 계정'}
        </Txt>
        <Pressable accessibilityRole="button" style={dimPressed(styles.signOut)} onPress={onSignOut}>
          <Txt style={styles.signOutText}>로그아웃</Txt>
        </Pressable>
        {/* 되돌릴 수 없는 일이라 작고 조용하게, 누르면 한 번 더 묻는다 */}
        <Pressable accessibilityRole="button" style={dimPressed(styles.delete)} onPress={onDeleteAccount}>
          <Txt style={styles.deleteText}>계정 삭제</Txt>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(42, 37, 32, 0.3)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  email: { fontSize: 16, color: colors.ink },
  signOut: {
    marginTop: 8,
    minHeight: Math.max(HIT, 48),
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { fontSize: 15, color: colors.inkSoft },
  delete: { alignSelf: 'center', minHeight: HIT, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { fontSize: 13, color: colors.danger, textDecorationLine: 'underline' },
});
