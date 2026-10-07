import { Pressable, StyleSheet, View } from 'react-native';
import type { ItemKind } from '../../items/repo';
import { Highlight } from '../../ui/Highlight';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { LEGEND, type LegendEntry } from '../../ui/symbols';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

function Glyph({ symbol }: { symbol: LegendEntry['symbol'] }) {
  if (symbol === 'highlight') {
    return (
      <Highlight on>
        <Txt style={styles.hl}>가</Txt>
      </Highlight>
    );
  }
  if (symbol === 'more') return <Txt style={styles.more}>⋯</Txt>;
  return <StatusSymbol kind={symbol} />;
}

// (i) 팝오버 안의 기호 설명. 지금 고른 입력 종류는 형광펜으로 표시한다.
export function SymbolLegend({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  return (
    <View style={styles.box}>
      <Txt variant="hand">기호는 이렇게 읽어요</Txt>
      {LEGEND.map((g) => (
        <View key={g.name} style={[styles.row, g.kind === kind && styles.current]}>
          <View style={styles.glyph}>
            <Glyph symbol={g.symbol} />
          </View>
          <View style={styles.text}>
            <Txt variant="medium" style={styles.name}>
              {g.name}
            </Txt>
            <Txt style={styles.desc}>{g.desc}</Txt>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" style={styles.ok} onPress={onClose}>
        <Txt variant="medium" style={styles.okText}>
          알겠어요
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingTop: 10, paddingHorizontal: 12, gap: 2 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 6, borderRadius: 6 },
  current: { backgroundColor: colors.highlight },
  glyph: { width: 22, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  hl: { fontSize: 14 },
  more: { fontSize: 18, color: colors.faint },
  text: { flex: 1 },
  name: { fontSize: 14 },
  desc: { fontSize: 13, color: colors.muted },
  ok: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  okText: { fontSize: 14 },
});
