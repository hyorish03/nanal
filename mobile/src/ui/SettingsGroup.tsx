import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';
import { Txt } from './Txt';

// 설정 화면의 묶음 카드: 위에 작은 이름(있으면), 아래 종이 카드. 줄 사이 선은 SETTINGS_ROW_LINE을 마지막 줄 빼고 붙인다
export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {label && (
        <Txt variant="medium" accessibilityRole="header" style={styles.label}>
          {label}
        </Txt>
      )}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export const settingsStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  line: { borderBottomWidth: 1, borderBottomColor: colors.lineFaint },
  rowText: { fontSize: 16, lineHeight: 22, color: colors.ink },
  sub: { fontSize: 12, lineHeight: 16, color: colors.muted },
});

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { marginHorizontal: 4, fontSize: 13, lineHeight: 18, color: colors.muted },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 14, paddingHorizontal: 14 },
});
