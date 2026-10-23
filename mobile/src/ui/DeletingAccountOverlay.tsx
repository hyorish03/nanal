import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { colors } from './theme';
import { Txt } from './Txt';

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
  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(42, 37, 32, 0.3)' },
  busyCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 12 },
  busyText: { fontSize: 15, color: colors.inkSoft },
});
