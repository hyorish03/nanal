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

const BOOK_ASPECT = 0.7; // 덮인 책의 가로 ÷ 세로(A5 수첩 비율)
const BOOK_W = 0.6; // 책 폭 = 칸 폭의 이만큼(휴대폰 402 → 약 241)
const BOOK_MAX_H = 0.48; // 책 높이는 칸 높이의 이만큼을 넘지 않는다(넘으면 비율 그대로 줄인다)
const SPINE_OPEN_X = 0.33; // 펼친 뒤 책등이 오는 자리(칸 폭 기준). 왼쪽 면지는 화면 밖으로 조금 나가도 된다
const COVER_ANGLE = 168; // 다 펼친 표지는 책상에 닿기 조금 전에서 멈춘다
const LEAF_HANDOFF_DEG = 96; // 표지가 이만큼 넘어가 책등 왼쪽으로 눕기 시작하면 따로 된 판이 오른쪽 장을 맡는다
const GUTTER_W = 0.07; // 책등 쪽 그늘 폭(장 폭 기준)

// 덮인 책의 자리와 펼친 뒤 오른쪽 장으로 다가갈 배율.
// zoom: 오른쪽 장의 높이가 칸 높이를 꽉 채우는 배율. 장이 화면보다 가로로 넓어 오른쪽은 화면 밖으로 넘친다
// (가로로 넓은 칸에서는 폭도 모자라지 않게 더 키운다).
export function bookGeometry(width: number, height: number) {
  let w = width * BOOK_W;
  let h = w / BOOK_ASPECT;
  if (h > height * BOOK_MAX_H) {
    h = height * BOOK_MAX_H;
    w = h * BOOK_ASPECT;
  }
  const x = (width - w) / 2;
  const y = (height - h) / 2 - height * 0.02;
  const spineX = width * SPINE_OPEN_X; // 펼친 뒤 책등(= 오른쪽 장의 왼쪽 끝) x
  const zoom = Math.max(height / h, width / w);
  return { x, y, w, h, spineX, zoom };
}

type Props = {
  width: number; // 온보딩 칸 전체
  height: number;
  open: Animated.Value; // 0 덮임 → 1 표지가 넘어가고 책등이 칸 폭의 1/3쯤으로 옮겨 감
  zoom: Animated.Value; // 0 책상 → 1 오른쪽 장이 칸 높이를 꽉 채우고 왼쪽 끝이 칸 왼쪽에 닿음
  reduce: boolean;
  onOpen: () => void;
  canOpen: boolean;
};

// 종이 책상 위에 덮여 있는 다이어리. 누르면 표지가 왼쪽 책등을 축으로 넘어가고, 그 오른쪽 장으로 다가간다.
// 오른쪽 장은 확대가 끝났을 때의 크기(책 × zoom)로 노트 한 장을 그린 뒤 책 크기로 줄여 둔 것이다.
// 줄 배율은 진짜 노트(칸 폭)와 같게 잡아, 확대가 끝나면 화면에 보이는 왼쪽 칸 폭만큼이 진짜 노트와 그대로 겹친다.
// 다가가는 장은 책 장면 밖의 따로 된 판에 그린다. 장면(× zoom) 안에서 다시 줄인(÷ zoom) 장을 키우면
// 작게 그려진 그대로 커져 줄이 뭉개지고 몇 줄은 빠진다. 판 하나에 변환을 하나만 주면 끝에서 진짜 노트와 똑같다.
export function BookScene({ width, height, open, zoom, reduce, onOpen, canOpen }: Props) {
  const book = bookGeometry(width, height);
  const z = book.zoom;
  const pageW = book.w * z; // 확대가 끝났을 때 오른쪽 장의 크기(칸보다 넓거나 같다)
  const pageH = book.h * z;
  // 표지가 넘어가는 동안 책을 오른쪽으로 옮겨 책등을 칸 폭의 1/3쯤에 둔다. 오른쪽 장은 화면 안에 다 들어온다
  const shift = open.interpolate({ inputRange: [0, 1], outputRange: [0, book.spineX - book.x] });
  // 왼쪽 위를 기준으로 키우고 옮겨, 오른쪽 장의 왼쪽 위 모서리가 칸의 왼쪽 위 모서리에 닿게 한다
  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, z] });
  const tx = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -z * book.spineX] });
  const ty = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -z * book.y] });
  // 따로 된 판: 위 장면 변환을 한 번에 합친 값. 책 속 오른쪽 장과 같은 자리·크기에서 시작해 칸 왼쪽 위로 간다.
  // 표지가 책등 왼쪽으로 넘어간 뒤에야 나타나, 넘어가는 표지를 가리지 않는다.
  const leafX = Animated.add(
    open.interpolate({ inputRange: [0, 1], outputRange: [book.x, book.spineX] }),
    zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -book.spineX] }),
  );
  const leafY = zoom.interpolate({ inputRange: [0, 1], outputRange: [book.y, 0] });
  const leafScale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1 / z, 1] });
  const handoff = LEAF_HANDOFF_DEG / COVER_ANGLE;
  const leafShown = open.interpolate({ inputRange: [0, handoff, handoff + 0.001, 1], outputRange: [0, 0, 1, 1] });
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

  // 오른쪽 장 한 벌: 노트 한 장(확대 끝 크기, 줄 배율은 칸 폭 기준)과 책등 쪽 그늘
  const leaf = (gradientId: string) => (
    <>
      <NotePage step={0} mode="blank" width={pageW} height={pageH} scaleWidth={width} />
      <Animated.View style={[styles.gutter, { width: pageW * GUTTER_W, opacity: gutter }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.shadow} stopOpacity={0.16} />
              <Stop offset="1" stopColor={colors.shadow} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </>
  );

  return (
    <>
      <Animated.View style={[styles.scene, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}>
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
              titleSize={Math.round(book.w * 0.167)}
              subtitle="하루를 한 줄씩"
              footer={String(new Date().getFullYear())}
              open={open}
              openAngle={COVER_ANGLE}
              inside={
                // 표지가 넘어가기 시작할 때 드러나는 오른쪽 장. 확대 끝 크기로 그려 책 크기로 줄인다
                <View style={[styles.page, { width: pageW, height: pageH, transform: [{ scale: 1 / z }] }]}>
                  {leaf('onboarding-gutter-in')}
                </View>
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
      {/* 표지가 넘어간 뒤 오른쪽 장을 맡는 판. 이 판이 확대되어 진짜 첫 장과 겹친다 */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.page,
          {
            width: pageW,
            height: pageH,
            opacity: leafShown,
            transform: [{ translateX: leafX }, { translateY: leafY }, { scale: leafScale }],
          },
        ]}
      >
        {leaf('onboarding-gutter-leaf')}
      </Animated.View>
    </>
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
