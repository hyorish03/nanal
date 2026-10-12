import { Animated, StyleSheet, View } from 'react-native';
import { colors } from './theme';
import { Txt } from './Txt';

type Props = {
  width: number;
  height: number;
  titleSize: number;
  subtitle?: string;
  footer?: string;
  open?: Animated.Value; // 0 덮임 → 1 펼침. 표지만 책등을 축으로 넘어가고 속지는 제자리에 있다
};

const PAGE_LINES = 7;

// 종이 묶음 위에 놓인 하드커버 다이어리. 장식이므로 스크린 리더에서 숨긴다.
export function BookCover({ width, height, titleSize, subtitle, footer, open }: Props) {
  const scale = width / 262;
  const angle = open?.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-180deg'] }) ?? '0deg';
  // 표지 뒷면(면지)은 같은 판을 제 가운데 축으로 한 번 더 뒤집어 둔다. 90°를 넘으면 앞면 대신 보인다.
  const leaf = (back: boolean) => [
    { perspective: 1200 },
    { rotateY: angle },
    ...(back ? [{ translateX: width / 2 }, { rotateY: '180deg' }, { translateX: -width / 2 }] : []),
  ];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: width + 6, height: height + 6 }}>
      <View style={[styles.pages, { width, height, paddingTop: height * 0.18, paddingHorizontal: 18 * scale }]}>
        <View style={styles.gutter} />
        {Array.from({ length: PAGE_LINES }, (_, i) => (
          <View key={i} style={[styles.pageLine, { marginBottom: height * 0.09 }]} />
        ))}
      </View>
      {open && (
        <Animated.View style={[styles.cover, styles.endpaper, { width, height, transform: leaf(true) }]} />
      )}
      <Animated.View style={[styles.cover, { width, height, paddingTop: height * 0.24, transform: leaf(false) }]}>
        <View style={[styles.spine, { width: 16 * scale }]} />
        <View style={[styles.frame, { top: 14 * scale, bottom: 14 * scale, left: 30 * scale, right: 14 * scale }]} />
        <View style={[styles.band, { right: 34 * scale, width: 7 * scale }]} />
        <Txt variant="title" style={[styles.title, { fontSize: titleSize, letterSpacing: titleSize / 8 }]}>
          나날
        </Txt>
        {subtitle && (
          <>
            <View style={styles.rule} />
            <Txt variant="title" style={styles.subtitle}>
              {subtitle}
            </Txt>
          </>
        )}
        {footer && (
          <Txt variant="title" style={styles.footer}>
            {footer}
          </Txt>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: {
    position: 'absolute',
    top: 6,
    left: 6,
    overflow: 'hidden',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#EFE6D3',
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#DCD0BA',
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
  },
  pageLine: { height: StyleSheet.hairlineWidth, backgroundColor: colors.ruled },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    alignItems: 'center',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: colors.navy,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
  // 뒤집힌 판이라 왼쪽 모서리가 펼쳤을 때 바깥쪽이 된다
  endpaper: {
    backgroundColor: '#E8DDC7',
    borderWidth: 1,
    borderColor: '#D6C9B0',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  gutter: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 10, backgroundColor: 'rgba(42, 37, 32, 0.06)' },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
  },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(233, 223, 200, 0.45)', borderRadius: 2 },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.navyDeep },
  title: { color: colors.coverText },
  rule: { marginTop: 14, width: 28, height: 1, backgroundColor: 'rgba(233, 223, 200, 0.7)' },
  subtitle: { marginTop: 14, fontSize: 13, letterSpacing: 3, color: 'rgba(233, 223, 200, 0.85)' },
  footer: { position: 'absolute', bottom: 30, fontSize: 11, letterSpacing: 4, color: 'rgba(233, 223, 200, 0.6)' },
});
