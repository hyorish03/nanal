import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ItemKind } from '../../items/repo';
import { Highlight } from '../../ui/Highlight';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { LEGEND, type LegendEntry } from '../../ui/symbols';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { dimPressed } from '../../ui/press';

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

type Props = {
  kind?: ItemKind;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void; // 있으면 제목 줄을 눌러 설명을 접고 편다(넓은 배치의 오른쪽 칸)
};

// (i) 팝오버 안의 기호 설명. 지금 고른 입력 종류는 고른 칩과 같은 바탕으로 표시한다.
// 넓은 배치의 오른쪽 칸에 둘 때는 kind·onClose 없이 쓰고, onToggle로 접고 편다.
export function SymbolLegend({ kind, onClose, collapsed = false, onToggle }: Props) {
  const title = <Txt variant="hand">기호는 이렇게 읽어요</Txt>;
  return (
    <View style={styles.box}>
      {onToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel="기호는 이렇게 읽어요"
          accessibilityHint={collapsed ? '설명을 펼쳐요' : '설명을 접어요'}
          style={dimPressed(styles.toggle)}
          onPress={onToggle}
        >
          {title}
          <View style={styles.toggleSide}>
            <Txt style={styles.toggleText}>{collapsed ? '펴기' : '접기'}</Txt>
            <Svg width={14} height={14} viewBox="0 0 14 14" accessible={false}>
              <Path d={collapsed ? 'M3 5l4 4 4-4' : 'M3 9l4-4 4 4'} fill="none" stroke={colors.muted} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
          </View>
        </Pressable>
      ) : (
        title
      )}
      {!collapsed && LEGEND.map((g) => (
        <View key={g.name} style={[styles.row, kind !== undefined && g.kind === kind && styles.current]}>
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
      {onClose && (
        <Pressable accessibilityRole="button" style={dimPressed(styles.ok)} onPress={onClose}>
          <Txt variant="medium" style={styles.okText}>
            닫기
          </Txt>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingTop: 10, paddingHorizontal: 12, gap: 2 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleText: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 6, borderRadius: 6 },
  current: { backgroundColor: colors.chipSelected },
  glyph: { width: 22, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  hl: { fontSize: 14 },
  more: { fontSize: 18, color: colors.faint },
  text: { flex: 1 },
  name: { fontSize: 14 },
  desc: { fontSize: 13, color: colors.muted },
  ok: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  okText: { fontSize: 14 },
});
