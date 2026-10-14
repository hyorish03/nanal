import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BookCover } from '../../ui/BookCover';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { NotePage } from './NotePage';

export const OPEN_MS = 1100; // 표지가 넘어가는 시간
export const OPEN_EASE = Easing.bezier(0.55, 0.05, 0.2, 1);
export const ZOOM_DELAY_MS = 50; // 표지가 다 넘어간 뒤 숨 한 번
export const ZOOM_MS = 900; // 오른쪽 장으로 다가가는 시간
export const ZOOM_EASE = Easing.bezier(0.65, 0, 0.35, 1);

const BOOK_SCALE = 0.46; // 책 한 권 = 노트 한 장(화면)의 이만큼. 펼친 두 쪽(0.92)이 화면 안에 들어온다
const COVER_ANGLE = 168; // 다 펼친 표지는 책상에 닿기 조금 전에서 멈춘다

// 덮인 책의 자리. 책 속 오른쪽 장은 화면(노트 한 장)과 같은 비율이라, 확대하면 그대로 노트가 된다.
export function bookGeometry(width: number, height: number) {
  const w = width * BOOK_SCALE;
  const h = height * BOOK_SCALE;
  const x = (width - w) / 2;
  const y = (height - h) / 2 - height * 0.02;
  return { x, y, w, h };
}

type Props = {
  width: number; // 온보딩 칸 전체
  height: number;
  open: Animated.Value; // 0 덮임 → 1 표지가 넘어가고 책이 반 권 오른쪽으로
  zoom: Animated.Value; // 0 책상 → 1 오른쪽 장이 칸을 꽉 채움
  reduce: boolean;
  onOpen: () => void;
  canOpen: boolean;
};

// 종이 책상 위에 덮여 있는 다이어리. 누르면 표지가 왼쪽 책등을 축으로 넘어가고, 그 오른쪽 장으로 다가간다.
// 오른쪽 장은 노트 한 장을 칸 크기 그대로 그린 뒤 책 크기로 줄여 둔 것이라, 확대가 끝나면 진짜 노트와 겹친다.
export function BookScene({ width, height, open, zoom, reduce, onOpen, canOpen }: Props) {
  const book = bookGeometry(width, height);
  const s = book.w / width; // 오른쪽 장의 축소 배율
  const z = width / book.w; // 확대 배율(= 1 / s)
  // 표지가 넘어가면 펼친 두 쪽이 가운데 오도록 책을 반 권 오른쪽으로 옮긴다
  const shift = open.interpolate({ inputRange: [0, 1], outputRange: [0, book.w / 2] });
  // 왼쪽 위를 기준으로 키우고 옮겨, 오른쪽 장의 네 모서리가 칸의 네 모서리에 닿게 한다
  const pageX = book.x + book.w / 2;
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, z] });
  const tx = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -z * pageX] });
  const ty = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -z * book.y] });
  // 책등 쪽 그늘은 다가갈수록 옅어진다(노트 한 장에는 없다)
  const gutter = zoom.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0], extrapolate: 'clamp' });

  // 안내 손글씨는 천천히 숨 쉬듯 옅어졌다 돌아오고, 표지가 넘어가기 시작하면 사라진다
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, breath]);
  const hintOpacity = Animated.multiply(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
    open.interpolate({ inputRange: [0, 0.12], outputRange: [1, 0], extrapolate: 'clamp' }),
  );
  const hintDrop = breath.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });

  return (
    <Animated.View
      style={[styles.scene, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="책 펼치기"
        disabled={!canOpen}
        onPress={onOpen}
        style={[styles.book, { left: book.x, top: book.y }]}
      >
        <Animated.View style={{ transform: [{ translateX: shift }] }}>
          <BookCover
            width={book.w}
            height={book.h}
            titleSize={Math.round(book.w * 0.177)}
            subtitle="하루를 한 줄씩"
            footer={String(new Date().getFullYear())}
            open={open}
            openAngle={COVER_ANGLE}
            inside={
              <>
                {/* 노트 한 장을 칸 크기로 그려 책 크기로 줄인다 */}
                <View style={[styles.page, { width, height, transform: [{ scale: s }] }]}>
                  <NotePage step={0} mode="blank" width={width} height={height} />
                </View>
                <Animated.View style={[styles.gutter, { width: book.w * 0.07, opacity: gutter }]}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <LinearGradient id="onboarding-gutter" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={colors.shadow} stopOpacity={0.16} />
                        <Stop offset="1" stopColor={colors.shadow} stopOpacity={0} />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#onboarding-gutter)" />
                  </Svg>
                </Animated.View>
              </>
            }
            endpaper={
              <View style={styles.endpaper}>
                <Txt variant="hand" style={[styles.owner, { fontSize: Math.max(15, book.w * 0.077) }]}>
                  이 노트의 주인: 나
                </Txt>
              </View>
            }
          />
        </Animated.View>
      </Pressable>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.hint, { top: book.y + book.h + 34, opacity: hintOpacity, transform: [{ translateY: hintDrop }] }]}
      >
        <Txt variant="handLg" style={styles.hintText}>
          표지를 눌러 펼쳐 보세요
        </Txt>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { ...StyleSheet.absoluteFill, transformOrigin: [0, 0, 0] },
  book: { position: 'absolute' },
  page: { position: 'absolute', top: 0, left: 0, transformOrigin: [0, 0, 0] },
  gutter: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  endpaper: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '15%' },
  owner: { color: colors.inkSoft, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintText: { color: colors.inkSoft },
});
