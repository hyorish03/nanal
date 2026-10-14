import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { Paper } from './Paper';
import { WIDE } from './responsive';
import { colors, HIT } from './theme';
import { Txt } from './Txt';
import { useSpace } from './typeScale';

export type SidebarKey = 'today' | 'evening' | 'archive';

type Props = { current: SidebarKey; onSelect: (key: SidebarKey) => void };

const ICON = 20;
const SPINE_W = 10; // 왼쪽 끝 남색 천 책등

// 아이패드·Mac의 왼쪽 칸. 공책 왼쪽에 붙은 남색 책등과 면지 한 장에 오늘·하루 마무리·지난 기록을 적어 둔다.
// 휴대폰의 하루 마무리 버튼과 지난 기록 책갈피 끈을 대신한다.
export function Sidebar({ current, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const s = useSpace();
  return (
    <View style={[styles.wrap, { width: WIDE.sidebarWidth + insets.left, paddingTop: insets.top + s.lg, paddingBottom: insets.bottom + s.lg }]}>
      <Paper />
      <View style={styles.spine}>
        <Paper texture="cloth" />
      </View>
      <View style={[styles.inner, { paddingLeft: SPINE_W + s.md + insets.left, paddingRight: s.md, gap: s.xl }]}>
        <Txt variant="title" accessibilityRole="header" style={styles.brand}>
          나날
        </Txt>
        <View style={styles.list}>
          <Row label="오늘" icon={<TodayIcon />} selected={current === 'today'} onPress={() => onSelect('today')} />
          <Row label="하루 마무리" icon={<LampIcon />} selected={current === 'evening'} onPress={() => onSelect('evening')} />
          <Row label="지난 기록" icon={<RibbonIcon />} selected={current === 'archive'} onPress={() => onSelect('archive')} />
        </View>
      </View>
    </View>
  );
}

function Row({ label, icon, selected, onPress }: { label: string; icon: ReactNode; selected: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false); // Mac 포인터·아이패드 트랙패드가 올라왔다
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [styles.row, (hover || pressed) && styles.rowHover, selected && styles.rowSelected]}
    >
      {/* 고른 칸은 바탕색만이 아니라 왼쪽에 남색 끈 끝을 붙여 알린다 */}
      {selected && <View style={styles.mark} />}
      <View style={styles.icon}>{icon}</View>
      <Txt variant={selected ? 'medium' : 'body'} numberOfLines={1} style={selected ? styles.labelOn : styles.label}>
        {label}
      </Txt>
    </Pressable>
  );
}

// 줄 쳐진 한 쪽
function TodayIcon() {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none">
      <Rect x={3.5} y={2.5} width={13} height={15} rx={1.5} stroke={colors.inkSoft} strokeWidth={1.4} />
      <Line x1={6.5} y1={2.5} x2={6.5} y2={17.5} stroke={colors.marginRule} strokeWidth={1.2} />
      <Path d="M8.5 7.5h5M8.5 10.5h5M8.5 13.5h3" stroke={colors.inkSoft} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

// 하루 마무리의 등잔(책상 스탠드)
function LampIcon() {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none">
      <Path d="M6 3.5h8l2.5 6h-13L6 3.5Z" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M10 9.5v6M6.5 16.5h7" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

// 지난 기록의 책갈피 끈(휴대폰 화면 맨 위 끈과 같은 모양)
function RibbonIcon() {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none">
      <Path d="M6.5 2h7v16l-3.5-3-3.5 3V2Z" fill={colors.navy} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paper,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SPINE_W,
    backgroundColor: colors.navy,
    borderRightWidth: 1,
    borderRightColor: colors.navyDeep,
  },
  inner: { flex: 1 },
  brand: { fontSize: 24, letterSpacing: 4, paddingHorizontal: 12, color: colors.navy },
  list: { gap: 2 },
  row: {
    minHeight: HIT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowHover: { backgroundColor: colors.pressTint },
  rowSelected: { backgroundColor: colors.chipSelected },
  mark: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 1.5, backgroundColor: colors.navy },
  icon: { width: ICON, height: ICON },
  label: { flexShrink: 1, color: colors.inkSoft },
  labelOn: { flexShrink: 1, color: colors.ink },
});
