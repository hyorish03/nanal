import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { euRo } from '../lib/josa';
import { usePane } from './pane';
import { dimPressed } from './press';
import { colors, HIT, space } from './theme';
import { Txt } from './Txt';

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string; // 돌아갈 곳 이름
  backAccessibilityLabel?: string;
  right?: ReactNode; // 맨 위 줄 오른쪽에 놓을 버튼 등
  // 돌아가는 곳이 오늘이라 사이드바가 대신할 수 있다. 사이드바가 있으면(아이패드·Mac) 돌아가기를 숨긴다.
  // 기본은 backLabel이 '오늘'일 때. 월간 돌아보기의 '‹ 지난 기록'처럼 다른 곳으로 가면 늘 보인다.
  sidebarBack?: boolean;
  largeBack?: boolean; // 돌아가기 화살표를 크게, 머리를 넉넉하게(설정)
};

// 오늘 아래 화면들의 머리. 맨 위 왼쪽에 돌아가기, 그 아래 왼쪽 정렬 큰 제목. 사이드바가 있으면 오늘로 가는 돌아가기는 숨긴다.
export function PageHeader({ title, subtitle, onBack, backLabel = '오늘', backAccessibilityLabel, right, sidebarBack = backLabel === '오늘', largeBack = false }: Props) {
  const hideBack = usePane().sidebar && sidebarBack;
  return (
    <View style={[styles.header, hideBack && styles.headerWide, largeBack && styles.headerLarge]}>
      {hideBack ? (
        right && <View style={[styles.top, styles.topRight]}>{right}</View>
      ) : (
        <View style={[styles.top, largeBack && styles.topLarge]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel ?? `${backLabel}${euRo(backLabel)} 돌아가기`}
            hitSlop={{ left: 8 }}
            style={dimPressed(styles.back)}
            onPress={onBack}
          >
            <Txt compact style={[styles.chevron, largeBack && styles.chevronLarge]}>‹</Txt>
            <Txt compact variant="small" numberOfLines={1}>
              {backLabel}
            </Txt>
          </Pressable>
          {right}
        </View>
      )}
      <View style={styles.titleBox}>
        {/* 글자를 키워도 잘리지 않고 다음 줄로 넘어간다(numberOfLines를 두지 않는다) */}
        <Txt variant="display" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle && <Txt variant="small" style={styles.subtitle}>{subtitle}</Txt>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  headerWide: { paddingTop: space.lg }, // 돌아가기 줄이 없으면 맨 위에 그만큼 숨을 둔다
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: HIT },
  topRight: { justifyContent: 'flex-end' },
  headerLarge: { gap: space.md, paddingBottom: space.sm },
  topLarge: { minHeight: 52 },
  // 글자는 화면 여백에 맞추고, 누르는 영역만 왼쪽으로 조금 더 넓힌다
  back: { flexShrink: 1, minHeight: HIT, minWidth: HIT, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingRight: space.sm },
  chevron: { fontSize: 22, lineHeight: 24, color: colors.ink, marginTop: -2 },
  chevronLarge: { fontSize: 36, lineHeight: 38, marginTop: -4 },
  titleBox: { gap: 2 },
  subtitle: { color: colors.muted },
});
