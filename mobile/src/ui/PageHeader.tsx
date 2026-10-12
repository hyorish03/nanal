import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { euRo } from '../lib/josa';
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
};

// 오늘 아래 화면들의 머리. 맨 위 왼쪽에 돌아가기, 그 아래 왼쪽 정렬 큰 제목.
export function PageHeader({ title, subtitle, onBack, backLabel = '오늘', backAccessibilityLabel, right }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel ?? `${backLabel}${euRo(backLabel)} 돌아가기`}
          hitSlop={{ left: 8 }}
          style={dimPressed(styles.back)}
          onPress={onBack}
        >
          <Txt compact style={styles.chevron}>‹</Txt>
          <Txt compact variant="small" numberOfLines={1}>
            {backLabel}
          </Txt>
        </Pressable>
        {right}
      </View>
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
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: HIT },
  // 글자는 화면 여백에 맞추고, 누르는 영역만 왼쪽으로 조금 더 넓힌다
  back: { flexShrink: 1, minHeight: HIT, minWidth: HIT, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingRight: space.sm },
  chevron: { fontSize: 22, lineHeight: 24, color: colors.ink, marginTop: -2 },
  titleBox: { gap: 2 },
  subtitle: { color: colors.muted },
});
