import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountLinks } from './AccountLinks';
import { EASE_OUT } from './motion';
import { dimPressed } from './press';
import { colors, HIT } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

type Props = {
  visible: boolean;
  email: string | null;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onDismissed?: () => void; // 시트가 완전히 내려간 뒤. 확인 창은 여기서 띄운다(모달이 닫히는 중에 띄우면 iOS가 삼킨다)
};

// 오늘 화면 계정 버튼을 누르면 아래에서 올라오는 작은 종이 시트: 이 노트의 주인(이메일), 로그아웃, 처리방침·문의하기·계정 삭제
export function AccountSheet({ visible, email, onClose, onSignOut, onDeleteAccount, onDismissed }: Props) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const show = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const dismissed = useRef(onDismissed);
  useEffect(() => {
    dismissed.current = onDismissed;
  }, [onDismissed]);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(show, { toValue: visible ? 1 : 0, duration: reduce ? 0 : visible ? 260 : 180, easing: EASE_OUT, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !visible) {
          setMounted(false);
          // iOS는 Modal의 onDismiss가 알려 준다
          if (Platform.OS !== 'ios') dismissed.current?.();
        }
      },
    );
  }, [visible, reduce, show]);

  const lift = show.interpolate({ inputRange: [0, 1], outputRange: [280, 0] });
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} onDismiss={Platform.OS === 'ios' ? onDismissed : undefined} statusBarTranslucent>
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
        <AccountLinks onDeleteAccount={onDeleteAccount} />
      </Animated.View>
    </Modal>
  );
}

// 계정을 지우는 동안 앱 전체를 덮는다. 끝나면 로그아웃되거나 실패 안내가 뜬다
export function DeletingAccountOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.busy} accessibilityViewIsModal accessibilityLiveRegion="polite">
        <View style={styles.busyCard}>
          <ActivityIndicator color={colors.navy} />
          <Txt style={styles.busyText}>삭제하는 중…</Txt>
        </View>
      </View>
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
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42, 37, 32, 0.3)' },
  busyCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 12 },
  busyText: { fontSize: 15, color: colors.inkSoft },
});
