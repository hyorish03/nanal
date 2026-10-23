import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { SymbolKind } from './symbols';
import { colors } from './theme';
import { Txt } from './Txt';

// 줄 앞의 상태 기호 하나(스펙 11.2). 의미는 줄의 접근성 문구가 전한다.
// ○·–·›도 글자가 아니라 같은 칸(size) 가운데에 그린다: 글자로 쓰면 작고 가늘어 서로 헷갈렸다.
export function StatusSymbol({ kind, size = 19 }: { kind: SymbolKind; size?: number }) {
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
  if (kind === 'dropped') {
    // 안 하기로 한 일: 작고 옅은 × 한 획. 끝낸 일(채운 동그라미)·지우기 버튼(빨강)과 섞이지 않게 가늘고 흐리게
    const arm = Math.round(size * 0.55);
    return (
      <View accessible={false} style={[styles.cross, { width: size, height: size }]}>
        <View style={[styles.stroke, { width: arm, transform: [{ rotate: '45deg' }] }]} />
        <View style={[styles.stroke, { width: arm, transform: [{ rotate: '-45deg' }] }]} />
      </View>
    );
  }
  const box = [styles.box, { width: size, height: size }];
  if (kind === 'migrated') {
    // 옮긴 일: 굵은 꺾쇠
    return (
      <View accessible={false} style={box}>
        <Svg width={size} height={size} viewBox="0 0 18 18">
          <Path d="M6.5 3.8 L11.8 9 L6.5 14.2" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    );
  }
  if (kind === 'note') {
    // 메모: 짧은 막대
    return (
      <View accessible={false} style={box}>
        <View style={[styles.bar, { width: Math.round(size * 0.63) }]} />
      </View>
    );
  }
  // 할 일: 빈 동그라미. 진행 중(반 찬 원)·끝(찬 원)과 같은 링이라 누를수록 차오른다
  return <View accessible={false} style={[styles.circle, styles.ring, { width: size, height: size, borderRadius: size / 2 }]} />;
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5, borderColor: colors.navy, alignItems: 'flex-start' },
  half: { height: '100%', backgroundColor: colors.navy },
  filled: { backgroundColor: colors.navy },
  check: { color: colors.card },
  box: { alignItems: 'center', justifyContent: 'center' },
  bar: { height: 2, borderRadius: 1, backgroundColor: colors.ink },
  cross: { alignItems: 'center', justifyContent: 'center' },
  stroke: { position: 'absolute', height: 1.5, borderRadius: 1, backgroundColor: colors.muted },
});
