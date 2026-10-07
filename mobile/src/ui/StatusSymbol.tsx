import { StyleSheet, View } from 'react-native';
import type { SymbolKind } from './symbols';
import { colors } from './theme';
import { Txt } from './Txt';

const TEXT: Partial<Record<SymbolKind, string>> = { open: '•', note: '–', migrated: '›' };

// 줄 앞의 상태 기호 하나(스펙 11.2). 의미는 줄의 접근성 문구가 전한다.
export function StatusSymbol({ kind, size = 18 }: { kind: SymbolKind; size?: number }) {
  if (kind === 'doing') {
    return (
      <View accessible={false} style={[styles.circle, styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[styles.half, { width: size / 2 }]} />
      </View>
    );
  }
  if (kind === 'done') {
    return (
      <View accessible={false} style={[styles.circle, styles.filled, { width: size, height: size, borderRadius: size / 2 }]}>
        <Txt style={[styles.check, { fontSize: size * 0.6 }]}>✓</Txt>
      </View>
    );
  }
  return (
    <Txt accessible={false} style={[styles.glyph, { width: size, fontSize: kind === 'open' ? 20 : 18 }]}>
      {TEXT[kind]}
    </Txt>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5, borderColor: colors.navy, alignItems: 'flex-start' },
  half: { height: '100%', backgroundColor: colors.navy },
  filled: { backgroundColor: colors.navy },
  check: { color: colors.card },
  glyph: { textAlign: 'center', color: colors.ink },
});
